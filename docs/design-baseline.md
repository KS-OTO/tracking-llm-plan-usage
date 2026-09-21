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
   并注明「TDesign 无对应项，故自定义」。目前全部集中在 `--app-*` 一族
   （`--app-gutter` / `--app-menu-h` / `--app-title-size` / `--app-logo-h` / `--app-logo-max-w` /
   `--app-brand-gap` / `--app-last-updated-display` / `--app-anchor-offset`）
   与 `--card-min` / `--grid-cols`；**新增一个就得在那里写清理由**。
3. 若某个视觉需求 `--td-*` 表达不了 → **先提 issue 讨论是否改设计**，不要自建平行层。
4. **组件只从 `src/tdesign.ts` 的注册表注册**，不许 `app.use(TDesign)` 整库导入。
   整库默认导出的 `install` 就是「遍历 77 个组件逐个 `app.use`」，没有摇树余地 —— 只换这一处
   导入，入口 JS+CSS 的 gzip 从 **253.1 KB 涨到 443.9 KB**（+75%），JS 侧 raw 1.46 MB。它还会把
   77 套组件样式一起拖进来（各组件样式由各自的 `style/css.mjs` 随 JS 模块引入），所以
   「按需引入 TDesign 样式」这件事被一并解决，`main.ts` 里的 `es/style/index.css` 不用动。
   漏注册的症状是**静默**的（Vue 把解析不到的标签当自定义元素渲染，没内容也没报错），
   因此 `src/tdesign.test.ts` 扫全部模板逐条断言，且测试挂载器与生产**共用同一份注册表**。

### 0.1 品牌主题层：`src/assets/theme.css`

第 4 条管「组件从哪来」，这一条管「皮肤从哪来」。

**全站配色 / 圆角 / 字体只有一个入口：`src/assets/theme.css`，做法是覆盖 TDesign 的设计变量
（`--td-*`），不写任何组件选择器。** 前提是 2026-09-21 的实测：`src/` 下的 `.vue` 与 `.css`
里**零硬编码颜色**（无 hex、无 `rgb()`、无命名色），全部经 `var(--td-*)` / `var(--app-*)`
取值 —— 所以改这一层就等于重刷全站，组件侧一行不用动。

取值来自 18Bit 现网站点（`go.18bit.cn`、`help-dev.18bit.cn`、
`go.18bit.cn/help-docs/help-docs-index.html`）的**计算后样式**，不是目测：

| 角色            | 实测值                        | 落点                                       |
| --------------- | ----------------------------- | ------------------------------------------ |
| 页面底色        | `#16171b`                     | 暗色 `--td-bg-color-page`                  |
| 卡片表面        | `#292b32`                     | 暗色 `--td-bg-color-container`             |
| 主色            | `#0d51d9`                     | 品牌阶 anchor（亮 -7 / 暗 -8）             |
| 标题 / 正文次要 | `#f9faff` / `#959cb1`         | 暗色 `text-color-primary` / `-secondary`   |
| 链接 / 品牌文字 | 亮 `#0d51d9`、暗 `#749be9`    | `--td-text-color-brand` / `-link`          |
| 边框            | `rgba(106, 111, 130, 0.32)`   | `--td-component-border` / `-stroke`        |
| 圆角            | 卡片 0px、按钮 2px            | 整阶 2px（`--td-radius-round` 保持 999px） |
| 阴影            | 三个站一个都没有              | 收紧为贴边投影（不删，理由见 theme.css）   |
| 字体            | `system-ui, -apple-system, …` | `--td-font-family`（参考站已放弃在线字体） |

五条规矩：

1. **新增视觉值一律先进 `theme.css`**：组件里不写颜色，也不新增 `--ui-*` 平行层（同第 0 节）。
2. **亮色模式是推导的**：三个参考站只有暗色（亮/暗两次截图逐字节相同，无
   `prefers-color-scheme`），亮色取自同一调色板的亮色成员，因此**改动后必须人眼过一遍**。
3. **文字档位必须过 AA，且基准固定为「最差背景」**：亮色按最亮的 `#ffffff`、暗色按卡片面
   `#292b32` 算（卡片上的字才是正文）。`--td-text-color-placeholder` 在本项目是 `.muted` /
   页脚 / 时间戳的**真实正文**（不是输入框提示），所以取同色阶里仍能读的那一级 ——
   与品牌站最淡那档**刻意不一致**（品牌那档在页面底色上只有 2.63:1、纯白 2.74:1）。
   动这几档前先算对比度，`src/theme.test.ts` 里有断言兜底。
4. **告警色不随品牌走**：参考站的琥珀与粉色是插画用色、无语义用法，
   而 `--td-warning-*` / `--td-error-*` 一旦离开红/橙就读不出「这是出事」，
   故保持 TDesign 默认。
5. **文字色不许取「填充色」token**：`--td-brand-color` 是填充档（按钮底 / 进度条 / 开关），
   它的暗色值是给「上面压白字的色块」选的。拿它当文字色，亮色下侥幸可读、**暗色下掉到
   2.15:1**，而且所有门禁都是绿的。链接一律走 `--td-text-color-brand` / `-link`。这条是
   2026-09-21 实测踩出来的（`.models-link` / `.detail-links a`），守卫已覆盖。

**重测口径**（换配色时照做）：用 Playwright 取参考站的**计算后样式**（不是目测）→ 由 anchor
按官方色阶的混白/混黑比例生成 10 级阶 → 对实际选用的色跑全量对比度。本地草稿脚本在
`.workbuddy/ref/`（`shoot.cjs` / `surfaces.cjs` / `final-ramps.mjs` / `verify-contrast.mjs`），
**不入库**（`.workbuddy/` 在 `.gitignore` 里），所以上面记的是方法而非可执行入口。

**可复现的部分是门禁**：`src/theme.test.ts` 断言正文档位在亮暗两套下都过 AA、反白字在品牌
填充上过 AA、字面颜色不得外流到 `theme.css` 之外、且 `theme.css` 必须是 `main.ts` 的最后一个
导入。改配色先跑 `bun run test:unit`。

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

| 代号  | 语义         | 特征                                        | 例子                                                                               |
| ----- | ------------ | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| **W** | 时间窗口额度 | 有周期、会重置，读数形态是「进度 + 倒计时」 | 火山 5h/模型日额度/周/月、智谱 Coding Plan、New API 订阅、Kimi/MiniMax/OpenCode Go |
| **B** | 账户余额     | 只减不重置，读数形态是「一笔钱」            | DeepSeek、OpenRouter、智谱余额、New API 钱包、Gitee                                |
| **P** | 预购资源包   | 有总量与有效期，逐条消耗                    | 阿里云资源包、百度量包、Gitee 资源包、智谱 Token 包、TokenPlan 座席/共享包         |

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

| 类别（`Metric.kind`） | 精度                                                      | 舍入     | 适用                   |
| --------------------- | --------------------------------------------------------- | -------- | ---------------------- |
| `money`               | 2 位 + 千分位                                             | 截断向零 | 一切货币读数           |
| `tokens`              | 量级缩写（K 档 1 位 / M·B 档 2 位；不足 1K 退回计数精度） | 四舍五入 | token / CREDITS 总量   |
| `percent`             | 1 位                                                      | 四舍五入 | 百分比、比率、折算值   |
| `count`               | 0 位 + 千分位                                             | 四舍五入 | 请求次数、天数、个数   |
| `text` / `duration`   | 原样                                                      | —        | 枚举、日期文案、倒计时 |

三条容易踩的：

- **金额必须先做浮点补偿**（`truncateMoney` 内部已处理）：`1.15 * 100 === 114.99999999999999`，
  直接 `Math.trunc` 会得到 1.14（系统性少 1 分钱，实测 13 个样本里 7 个踩坑）。
- **「原样输出」是精度漏洞，任何一档都不能例外**：`formatTokens` 不足 1K 的那一档曾写
  `String(value)`，于是 `quota - used` 算出的 `206.34719999999652` 原样印到卡面上
  （火山 AFP 每周窗口，2026-09-20 报上来）。同一类还有 `-0`（`Math.round(-0.04)` 是 -0，
  文本是 `"-0"` / `"-0.0"`）与非有限数（`NaN` 会印成 `"NaN"`）。
  **判据：`src/format.ts` 的每个分支都必须落到某个精度上，没有一个分支允许原样返回输入数字。**
- **`<t-statistic>` 只许出现在 `components/ui/MetricTile.vue` 里**，且必须显式声明精度。
  它不传 `decimal-places` 时**不是取整**，而是原样输出 0–20 位小数；`value` / `format` 只吃
  number 且内部四舍五入 —— 所以金额交给它之前必须**已经截断**，显示位数再由 `decimalPlaces` 钉死。
  这条由 `src/format.test.ts` 的两条守卫强制：① 全站 `.vue` 里每个 `<t-statistic>` 都要有字面的
  `decimal-places` 或 `:format`；② 被豁免的那一个文件必须真的在用 `decimalPlaces` / `format`，
  且模板里只有一处 `<t-statistic>`。

## 6. `AccountDetail`：所有平台同构的账号详情

弹窗的不一致只是**模型的投影**。模型不统一，弹窗怎么调都会再漂。

**状态：已落地**（`#20`）。类型在 `src/types.ts`，构件库在 `src/detail.ts`，
10 个适配器与 10 个 Section 都已按本节改造完。

### 6.1 模型

```ts
/** 一个字段（① 身份区 / ③ 扩展区的通用单元）。 */
interface Field {
  label: string
  value: string
  hint?: string // 次要说明（弱化色）
  span?: 1 | 2 // 需要独占一行时置 2
}

/** 一个读数（卡面读数带与弹窗读数区共用同一份，见 #19）。 */
interface Metric {
  key: string
  label: string
  value: number | string | null // null = 「没有这个值」，渲染成 —，不伪造 0
  unit?: string // 货币用符号、计数用量纲、未知为 undefined
  kind: 'money' | 'tokens' | 'count' | 'percent' | 'text' | 'duration'
  cardFace?: boolean // false = 只进弹窗
  tone?: 'danger' // 危险色（余额低于门槛）
}

/** 时间窗口额度（W）。 */
interface WindowQuota {
  key: string
  label: string // 「5 小时窗口」
  used: number | null
  total: number | null
  remaining: number | null
  percent: number // **原始值**（可能带小数）；钳位与取整由 progressPercentage 一处负责
  resetAt: number | null
  unit?: string
  countKind?: 'money' | 'count' | 'tokens' // 数值行按哪种精度算；缺省 tokens
  status?: string // 上游状态原文（`rate-limited` 这类）
  cardFace?: boolean
  note?: string // 平台专属脚注（New API 的「周期 7 天」）
}

/** 明细表（③ 区，空则渲染空态）。 */
interface DataTable {
  title: string
  columns: Array<{
    key: string
    label: string
    align?: 'left' | 'right'
    kind?: 'text' | 'status' // status 渲染成标签，配色走共享词表
  }>
  rows: Array<Record<string, string | number>> // 行值由适配器格式化好
  summary?: Metric[] // 只对这张表成立的读数
  emptyText?: string
}

/** 所有平台同构的账号详情。 */
interface AccountDetail {
  identity: Field[] // ① 身份：别名 / Key / 站点
  metrics: Metric[] // ② 其余主读数（与卡片同源）
  windows: WindowQuota[] // ② W 语义
  balances: Metric[] // ② B 语义
  tables: DataTable[] // ③ 明细 + 平台扩展
  meta: Field[] // ③ 平台特有字段（唯一允许自由发挥的区）
  links: LinkField[] // ④ 外链（`role` 供卡片操作区按用途取）
  notices: Notice[] // ④ 告警（统一沉底）
  badge?: { label: string; theme: 'primary' | 'warning' | 'default' } // 卡头标签
}
```

**六个可选位的由来** —— 都是同一条理由：某个平台确实需要，但不该让别的平台跟着变形。

| 可选位                                     | 为什么必须由模型表达，而不是在组件里 `v-if`                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Metric.cardFace` / `WindowQuota.cardFace` | 同一份详情可能被两张卡共用（智谱的套餐卡与余额卡）。卡面与弹窗的差异一旦交给组件各自挑字段，就回到「10 种摆法」那个起点                                 |
| `Metric.tone`                              | 余额低于门槛要染红 —— 颜色在这里是语义而不是样式                                                                                                        |
| `WindowQuota.note`                         | 平台专属脚注。曾经是 `UsageBar` 的第二个 prop，10 个调用点各传一份；现在随窗口从模型里来                                                                |
| `DataTable.summary`                        | 只对某张表成立的读数（火山推理用量的「总 Token」、Gitee 代金券的两个余额）。放账号级 `metrics` 会让卡面凭空多出数字，放 `meta` 又丢掉读数该有的大字排版 |
| `Notice.cardFace`                          | 默认只进弹窗；需要第一眼看到的（New API「站点未给额度口径」）显式置 true                                                                                |
| `LinkField.role`                           | 卡片操作区要按**用途**取链接。按出现顺序取会被新链接插队，按标签字符串取会因改文案而断                                                                  |

### 6.2 分区职责（适配器按这张表落位）

| 数组                | 卡面          | 弹窗 | 放什么                            |
| ------------------- | ------------- | ---- | --------------------------------- |
| `identity`          | —             | ①    | 别名 / Key / 站点（标签全站统一） |
| `windows`           | ✅            | ②    | **W**：有周期、会重置             |
| `balances`          | ✅            | ②    | **B**：带币种、只减不重置         |
| `metrics`           | ✅            | ②    | 其余主读数（汇总 / 计数 / 用量）  |
| `meta`              | —             | ③    | 平台特有字段                      |
| `tables`            | —             | ③    | **P** 预购资源包 + 平台扩展明细表 |
| `notices` / `links` | 仅 `cardFace` | ④    | 告警与外链，统一沉底              |

卡面 = `windows` + `balances` + `metrics` 里 `cardFace !== false` 的那些
（`detail.ts` 的 `cardWindows` / `cardMetrics`）。于是「卡型差异」退化成
「适配器往哪个数组放了什么」，**卡面组件里一个 `if` 都没有**。

### 6.3 适配器与构件库

- 每个平台一个 `to<平台>Detail(account, …): AccountDetail`，与 Section 同目录、命名 `<平台>Detail.ts`；
- 需要额外上下文的（平台名、卡片变体）由调用方**闭包捕获**
  （`cardsOf(accounts, (a) => toPlansDetail(a, provider))`），不给适配器加第二个参数 ——
  否则每个调用点都要凑一个泛型实参；
- `src/detail.ts` 是**构件库**：`field` / `flag` / `identityFields` / `withSite` /
  `moneyMetric` / `unitMoneyMetric` / `countMetric` / `tokenMetric` / `percentMetric` / `textMetric` /
  `moneyField` / `table` / `notice` / `link` / `linkOf` / `windowQuota` / `resetNote` / `resetAtNote` /
  `emptyDetail` / `cardWindows` / `cardMetrics` / `cardsOf`。
  10 份适配器的同类读数因此写法一致 —— 尤其是**适配器只声明 `kind`，绝不自己 `toFixed`**；
- `toAccountCard` / `cardsOf` 负责「失败账号」：`error` 非空时**不调适配器**，`detail` 为 `null`。
  模板于是只有一条路径（`card.error` → 告警，`card.detail` → 卡面与弹窗），不必对判别联合做收窄
  —— vue-tsc **不收紧调用表达式**（见第 1 节）。

### 6.4 骨架组件（弹窗与卡面各只此一套）

| 组件                 | 职责                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| `AccountCard`        | 卡头（别名 + Key + 标签 + 详情入口）+ 失败告警 / 卡面正文 + 弹窗            |
| `AccountCardBody`    | 卡面 = `cardWindows` + `cardMetrics` + `cardFace` 的告警                    |
| `AccountDetailPanel` | 弹窗四段骨架 ①→②→③→④，**零平台分支**                                        |
| `DetailSection`      | 分节标题（裸名词，计数由 `rows` 拼）+ 空态（缺省文案 `没有<标题>`）         |
| `DetailFields`       | `Field[]` → `t-descriptions :column="2"`                                    |
| `DetailTable`        | `DataTable` → 分节 + 汇总读数 + `t-table`（`kind:'status'` 的列渲染成标签） |
| `MetricTile`         | 一个 `Metric` → 一个 `t-statistic`，**语义 → 精度的唯一落点**               |
| `UsageBar`           | 一个 `WindowQuota` → 一个窗口块（见 #18）                                   |

**两条边界**（写下来免得下次再踩）：

1. **Section 的 props 仍然命名平台返回类型**（`AliyunPackagesResponse`…）—— 那是它与服务端的契约，
   必须能原样交给适配器。本节的规则是「**模板不认平台字段**」：Section 里只有
   `cardsOf(props.data?.accounts, toXxxDetail)` 加一个 `<AccountCard>`，10 个文件都在 40–90 行之间。
2. `OverviewTab` 的分节标题与三个汇总瓦片**不在本节范围内**：它们不是账号详情，没有 `AccountDetail`
   可投影（瓦片的值由页面自己汇总），因此保留手写的 `t-divider` 与 `<t-statistic>`。

### 6.5 统一词汇表

| 统一叫法 | 曾用叫法                                                        |
| -------- | --------------------------------------------------------------- |
| 别名     | （一致）                                                        |
| Key      | 密钥名（OpenRouter）                                            |
| 站点     | 用户名（New API 的 `username` 归入 `meta`，主身份位写站点域名） |

`meta` 里可以保留平台原始叫法，但 ① 身份区的标签全站统一。这条由
`openDetail()`（`src/test-utils/mount.ts`）统一断言：**每个平台的弹窗用例都会检查「别名 / Key」都在**。

**告警统一沉底**：弹窗内告警一律进 ④ 附加区。卡片上的告警负责「第一眼看到问题」，
弹窗里再放一遍会让人以为数据是坏的。
