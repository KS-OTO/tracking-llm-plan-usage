# 贡献指南

欢迎提交 issue 与 PR。这个项目对代码规模很克制，对**一致性**要求很高 —— 先读完下面
「代码铁律」再动手，能省掉一轮 review。

## 环境

| 依赖                  | 版本                                         |
| --------------------- | -------------------------------------------- |
| [Bun](https://bun.sh) | 1.2+（唯一的包管理与脚本运行器）             |
| Node.js               | `^22.18.0 \|\| >=24.12.0`（Playwright 需要） |

```bash
bun install
cp .env.example .env      # 按需填凭据；不填也能起来，只是没有数据
bun run dev:all           # 前端 5173 + 本地 /api 服务
```

只跑前端：`bun run dev`（`vite.config.ts` 内置了同源的 `/api` 开发中间件）。

`.env` 的取值细节（多账号编号、`$` 转义、Cookie 怎么填）全部写在
[`README.md`](README.md) 与 [`.env.example`](.env.example) 里，不在这里重复。

## 四道门禁

**提交前必须全绿，顺序固定：**

```bash
bun run test:unit     # 1. Vitest
bun run build         # 2. vue-tsc 类型检查 + 构建
bun run test:e2e      # 3. Playwright（无凭据的空态冒烟）
bunx vp check         # 4. oxlint + oxfmt + tsgolint —— 必须最后跑
```

嫌麻烦就一条命令（顺序已固定，任一步失败即中断）：

```bash
bun run check
```

`vp check` 放最后是有原因的：它连 **Markdown 表格对齐**都管，会让前面刚改过的文件
再次变动。它报格式问题时用 `bunx vp check --fix`，然后**再跑一次确认 0/0**。

> 改了任意 `.vue` 文件，`build` 这道是**必须**跑的 —— `vp check` 不做模板类型检查，
> 只靠它会把类型错误放进仓库。

## PR 流程

1. 从 `main` 切分支；分支名用**扁平名**（`fix-xxx`、`feat-xxx`），不要 `feat/xxx`。
2. 一个 PR 只做一件事。重构与行为变更**不要**混在同一个 commit 里。
3. 四道门禁全绿后提 PR 到 `main`，描述里写清「验收标准 → 实测结果」的对照。
4. 合并用 squash。合并后请重新拉 `main` 并复跑一次门禁 —— CI 与本地环境并非完全等价。

## 代码铁律

这些规则来自踩过的坑，不是风格偏好。PR 里违反会被要求改。

### UI 与样式

- **只用 TDesign Vue Next**，不迁移其他组件库，不模仿外部参考站。
  CSS 变量一律 `--td-*`，**禁止**引入 `--ui-*` 之类的平行 token 层（两处维护必然漂移）。
- **布局只用 `src/assets/layout.css` 里的语义化网格原语**。组件里禁写断点，
  也禁用 `t-row` / `t-col`（TDesign 栅格是 12 列，与本项目的列策略冲突）。
- **列策略由「个数」声明、由 `App.vue` 统一施加**：`shouldSpanFullRow`（≥2 整行）、
  `isCompactAccounts`（≥5 单列紧凑）、`metricGridClass`、`windowContainerClass`。
  改这些谓词要**同时**改 `App.vue` 的绑定与 `layout.css` 的规则 —— `utils.test.ts`
  里有接线守卫盯着这三处。
- 间距 / 字号一律用 TDesign token，**不写裸 px**。
- 全局 CSS **改不动** scoped 组件的已有属性（`.x[data-v]` 的特异性高于 `.x`）。
  断点要改组件已有属性时走**变量过桥**：值定义在 `:root`，组件只写 `var(--x)`。
- 弹窗居中必须 `placement="center"`（默认 `top` 会让顶距恒为 20vh）。

### 数值与渲染

- `<t-statistic>` **只允许出现在 `src/components/ui/MetricTile.vue`**，且必须显式声明精度
  （不传 `decimal-places` 它会原样输出 0–20 位小数）。`format.test.ts` 有守卫。
- 金额先过 `truncateMoney`（内含 `1e-9` 浮点补偿）再交给渲染层；
  渲染层**禁止** `toFixed` / `Math.round`。
- 卡面货币只显示**符号**，币种代码只出现在详情弹窗；单位是独立元素；
  币种未知时**不要猜**，只显示数值。

### 数据模型

- 详情视图统一建模成 `AccountDetail`（字段恒存在的扁平对象，失败取中性空值），
  平台差异收敛在各自 `*Detail.ts` 适配器里。Section 组件只负责
  `cardsOf(data.accounts, toXxxDetail)` + `<AccountCard>`，**模板里不认平台专属字段**。
- 切片取值用 `sliceData` / `sliceError`，不要在调用点写 `'data' in x`（TS 不收紧调用表达式）。
  多个子查询各自容错，避免共用 `Promise.all` 时一失败全丢。
- 环境变量的**单一事实来源**是 `server/env-vars.ts`。新增平台要动三处
  （`env-vars.ts` 登记 + `.env.example` 说明 + `.dev.vars.example` 同步），
  `server/env-vars.test.ts` 会断言漂移。

### 测试

- 单元测试与被测文件**同目录**；`.spec.ts` 是 E2E 专用。
- `expect` 只允许 **1 个参数**（`vitest(valid-expect)` 规则会拦）。
- 新增 `server/*.test.ts` 后确认它被 `tsconfig.vitest.json` 收进去了，
  否则会「假通过」。
- 读仓库文件用 `resolve(dirname(fileURLToPath(import.meta.url)), …)`，不要依赖 cwd。

## 凭据纪律（最重要的一条）

本仓库是**公开**的，且历史上曾误提交过真实令牌。因此：

1. **绝不**把真实 API Key、Cookie、Token 粘进任何入库文件。需要举例时用占位值
   （`sk-xxxx` / `AKLTxxxx` / `example-ns`）。
2. 测试夹具里的账号 id、命名空间、代金券码必须是**编造**的。
3. `docs/参考资料.md` 是控制台抓包的原始存档，**已经脱敏**。它同时也是本仓库历史上
   唯一泄过真令牌的地方 —— 往里贴东西前请对照 `.env.example` 的占位风格逐段检查。
4. 提交前自查：`git diff --cached` 里不应出现任何真实凭据或你个人的站点域名。
5. 一旦发现已提交的真实凭据：**先到平台吊销**，再联系我们清理历史。清理历史比吊销
   复杂得多，而且吊销才是真正让凭据失效的动作。

发现安全问题请走 [`SECURITY.md`](SECURITY.md) 的私密渠道，**不要**开公开 issue。

## Commit 与文档语言

- commit message 用**中文**，格式 `<type>: <结论>`（如 `fix: 窄屏导航两行后锚点避让量跟着导航高度走`），
  正文讲**为什么**，不要逐条罗列改了什么文件。
- 设计决策与推导写进 `docs/design-baseline.md`，**不要**只留在 PR 描述里。
- 涉及可视化规格（间距 / 精度 / 列策略）的改动，请同步更新 `docs/design-baseline.md`。

## 行为准则

参与本项目即表示你同意遵守 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。
