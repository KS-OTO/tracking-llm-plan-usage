# 设计系统基线

> 本文是 `#18`（用量条）/ `#19`（读数网格与单位）/ `#20`（`AccountDetail` 与弹窗骨架）的**规格来源**。
> 三个 issue 的实现方式可以不同，但都要回到本文核对。

## 0. 硬约束：TDesign 原生，token 只用 `--td-*`

**设计系统 = TDesign 原生**，不迁移 shadcn-vue、不模仿任何外部参考站（`#21` 已 `wontfix` 关闭）。

**所有视觉 token 必须来自 `--td-*`，禁止引入 `--ui-*` 平行 token 层。**

理由不是审美，是工程教训：本项目已经在「三份 env 文档」上踩过一次「同一概念两处维护必然漂移」
的坑（PR #16 —— `.env.example` / `.dev.vars.example` / `.env` 各写一份，结果主模板漏了整个 `BAIDU_*`）。
再引入一套 `--ui-*` 去「映射」`--td-*`，就是同一个坑的第二次：改 `--td-*` 不会同步到 `--ui-*`，
新人不知道该改哪一层，最后两套都在用、谁也不删。

规则：

1. 圆角 / 间距 / 字号 / 色值一律直接引用 `--td-*`（`var(--td-radius-medium)`、`var(--td-size-5)`、
   `var(--td-text-color-secondary)` …）。
2. 只有**纯语义、TDesign 没有对应概念**的值才允许自定义，必须写在 `layout.css` 的 `:root` 里，
   并注明「TDesign 无对应项，故自定义」（现有先例：`--metric-min`、`--card-min`、`--app-logo-h`、
   `--app-gutter`、`--app-menu-h`）。
3. 若某个视觉需求 `--td-*` 表达不了 → **先提 issue 讨论是否改设计**，不要自建平行层。

### 视觉细节的收敛口径：TDesign 默认 + 项目多数派

凡「具体数值」类的视觉细节（进度条高度、字号、圆角），**不引入外部参考的任何取值**，
而是以**本项目当前实现的多数派**为准做收敛。改法的口径统一为：

> 先统计现有各处的实际取值 → 取多数派作为标准 → 少数派向它对齐。

实测（2026-09-17，`grep -A6 '<t-progress' src/components/*.vue`，共 6 处）：

| 用法                                  | 处数 | 结论                                  |
| ------------------------------------- | ---- | ------------------------------------- |
| `:percentage="progressPercentage(x)"` | 6    | **标准**                              |
| `:status="progressStatus(x)"`         | 5    | **标准**（`NewApiSection` 缺失 → 补） |
| `:label="false"`                      | 5    | **标准**（`NewApiSection` 缺失 → 补） |
| 显式高度 / 圆角覆盖                   | 0    | 不覆盖，**用 TDesign 默认**           |

即：进度条几何 = TDesign 默认，只统一这三个属性，不写任何高度/圆角覆盖。

## 1. 语义聚类（W / B / P）

各平台的返回值看起来千差万别，但归纳下来只有三类语义：

| 代号  | 语义         | 特征                                        | 例子                                                                       |
| ----- | ------------ | ------------------------------------------- | -------------------------------------------------------------------------- |
| **W** | 时间窗口额度 | 有周期、会重置，读数形态是「进度 + 倒计时」 | 火山 5h/日/周/月、智谱 Coding Plan、New API 订阅、Kimi/MiniMax/OpenCode Go |
| **B** | 账户余额     | 只减不重置，读数形态是「一笔钱」            | DeepSeek、OpenRouter、智谱余额、New API 钱包、Gitee                        |
| **P** | 预购资源包   | 有总量与有效期，逐条消耗                    | 阿里云资源包、百度量包、Gitee 资源包、智谱 Token 包、TokenPlan 座席/共享包 |

**卡型由「这个账号命中哪几个语义」决定，不由平台决定。** 新增平台只需声明组合，不需要新写一套版式。

## 2. 卡型矩阵

| 卡型  | 语义组合 | 平台                                               | 卡面内容                          |
| ----- | -------- | -------------------------------------------------- | --------------------------------- |
| **A** | W        | 火山 Agent/Coding Plan、Kimi、MiniMax、OpenCode Go | 窗口条（进度 + 已用/总量 + 重置） |
| **B** | B        | DeepSeek、OpenRouter                               | 读数带（余额 / 充值 / 赠金…）     |
| **C** | W + B    | 智谱、New API                                      | 窗口条在上、读数带在下            |
| **D** | P(+B)    | 阿里云、百度千帆、TokenPlan、Gitee                 | 读数带 + 总量进度 + 明细入口      |

两条**区级**规则（不是字段级）：

1. **没有某语义就整区不渲染**。TokenPlan 没有脚注行、NewApi 没有窗口标题行，根因都是
   「该账号命中的语义里没有这一段」，不是「这个字段恰好为空」。用字段级 `v-if` 去补，
   就会长出一堆半空的骨架。
2. **两区顺序固定：W 在上、B 在下**（卡型 C）。同一张卡里不允许两种窗口容器混用
   （`NewApiSection` 曾同时用 `.window-list` 与 `.window-block`）。

## 3. 屏幕策略

三档，**沿用 `layout.css` 现有断点，不新增**：

| 档  | 视口       | 区块网格                   | 卡内账号卡  | 卡内窗口/读数 |
| --- | ---------- | -------------------------- | ----------- | ------------- |
| S   | < 768px    | 1 列                       | 纵向堆叠    | 窗口并排 2 列 |
| M   | 768–1199px | 2 列                       | 并排 2 列   | 2 列          |
| L   | ≥ 1200px   | 2 或 3 列（`--grid-cols`） | 并排 2–3 列 | 2–3 列        |

多 Key 规则沿用 `utils.shouldSpanFullRow`（`MIN_ACCOUNTS_FOR_FULL_ROW = 2`）：
**≥2 个 Key 的区块独占整行**，卡内账号卡才有并排的空间。

## 4. 单位规范

```
数值          单位
─────────    ────────
110.00       ¥        ← 货币：卡面一律用**符号**（¥ / $）
8.42         万 token  ← 计数：数值 + 中文量纲
56.70        （无）    ← 币种未知：只显示数值，不猜
```

- 币种代码 → 符号的映射**只维护一份**：`src/format.ts` 的 `currencySymbol()`。
  它同时也是全站数值格式化的单一入口（见下节），所以单位映射放在那里而不是另开一个模块。
- 单位渲染成**独立元素**（不再是 `value` 字符串的一部分），这样数值仍是纯数字，可复制、可断言。
- **禁止在标签里重复币种**：`CNY 总余额` → `总余额`。
- 币种代码（`CNY` / `USD`）**只保留在详情弹窗的「币种」字段**（那里需要精确）。

## 5. 精度规范

全站数值只有三种语义，精度由**语义**决定，不由调用点决定。实现与推导见 `src/format.ts`：

| 类别     | 精度          | 舍入     | 适用                             |
| -------- | ------------- | -------- | -------------------------------- |
| `money`  | 2 位          | 截断向零 | 一切货币读数                     |
| `number` | 1 位          | 四舍五入 | 百分比、比率、折算值             |
| `count`  | 0 位 + 千分位 | 四舍五入 | 请求次数、token 总量、天数、个数 |

两条容易踩的：

- **金额必须先做浮点补偿**（`truncateMoney` 内部已处理）：`1.15 * 100 === 114.99999999999999`，
  直接 `Math.trunc` 会得到 1.14（系统性少 1 分钱，实测 13 个样本里 7 个踩坑）。
- **`<t-statistic>` 不能用**：不传 `decimal-places` 时它原样输出 0–20 位小数（不是取整）；
  `value` / `format` 只吃 number 且内部四舍五入 —— 金额一律自绘。

## 6. `AccountDetail`：所有平台同构的账号详情

弹窗的不一致只是**模型的投影**。模型不统一，弹窗怎么调都会再漂。

```ts
/** 一个字段（身份区 / 扩展区的通用单元）。 */
interface Field {
  label: string
  value: string
  hint?: string // 次要说明，弱化色
  span?: 1 | 2 // 需要独占一行时置 2
}

/** 一个读数（卡片读数带与弹窗读数区共用同一份）。 */
interface Metric {
  key: string
  label: string
  value: number | string
  unit?: string // 货币用符号、计数用量纲、未知为 undefined
  kind: 'money' | 'tokens' | 'count' | 'percent' | 'text' | 'duration'
}

/** 时间窗口额度（W）。 */
interface WindowQuota {
  key: string
  label: string // 「5 小时窗口」
  used: number | null
  total: number | null
  remaining: number | null
  percent: number // 已钳位取整
  resetAt: number | null
  unit?: string
}

/** 明细表（③ 区，空则渲染空态）。 */
interface DataTable {
  title: string
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>
  rows: Array<Record<string, string | number>>
}

/** 所有平台同构的账号详情。 */
interface AccountDetail {
  identity: Field[] // ① 身份：别名 / Key / 站点
  metrics: Metric[] // ② 读数（与卡片同源）
  windows: WindowQuota[] // W 语义
  balances: Metric[] // B 语义
  tables: DataTable[] // ③ 明细 + 平台扩展
  meta: Field[] // ③ 平台特有字段（唯一允许自由发挥的区）
  links: Array<{ label: string; url: string }>
  notices: Array<{ level: 'info' | 'warn' | 'error'; text: string }>
}
```

**扩展设计原则**：

- 骨架 **① 身份 → ② 读数 → ③ 明细 → ④ 附加（外链 + 告警）** 对所有平台恒定，不允许例外；
- 平台差异**只通过 `meta: Field[]` 与 `tables: DataTable[]` 追加**，不改结构；
- 每个平台一个 `toAccountDetail(platformData): AccountDetail` 适配器 ——
  **新平台接入 = 一个适配器 + 零组件改动**；
- 反过来：组件只认 `AccountDetail`，**任何 Section 组件都不再 import 平台专属返回类型**。

**统一词汇表**（消除同一语义多种叫法）：

| 统一叫法 | 曾用叫法                        |
| -------- | ------------------------------- |
| 别名     | （一致）                        |
| Key      | 密钥名（OpenRouter）            |
| 站点     | 用户名（New API 的 `username`） |

`meta` 里可以保留平台原始叫法，但 ① 身份区的标签全站统一。

**告警统一沉底**：弹窗内告警一律进 ④ 附加区。卡片上的告警负责「第一眼看到问题」，
弹窗里再放一遍会让人以为数据是坏的。
