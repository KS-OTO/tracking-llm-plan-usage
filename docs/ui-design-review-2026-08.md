# UI 设计审查报告（2026-08）

> 审查人：UI 设计师（TDesign 方向）
> 审查对象：tracking-llm-plan-usage 前端（tdesign-vue-next 1.20.6）
> 审查方式：源码走读（App.vue / 全部 components / main.css / theme.ts）+ 本地起服 1440px 视口实测（computed style / DOM 计量）
> 对照规范：TDesign 官方 offices / color / fonts / layout（tdesign-composition skill references/design/）

**结论先行**：用户「对 TDesign 满意、对搭出来的页面不满意」的诊断成立。这个项目的**颜色 Token 化其实已经及格**（文字/背景基本走 `--td-*`），真正让页面「土」的不是配色，而是三件事：**① 用「边框套边框」表达层级（三层盒子同色同圆角同背景）；② 数据数字没有统一语言（四处手写大数字 + 标签墙）；③ 没有按「仪表盘页面模板」组织结构（Tabs 当整站导航、无页面头、间距档位散乱）**。全部可以只用 TDesign 组件与 Token 修复，不需要引入任何新组件库。

---

## 一、视觉诊断：现代感缺失的三大根因

### 根因 1：层级用「边框」表达，而不是用「背景 + 留白」表达 —— 全页边框汤

实测（1440px，套餐订阅 Tab）：可见描边元素 **37 个**。结构上是三层盒子嵌套：

| 层级    | 实现                                               | 证据                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 第 1 层 | 区块外壳 `t-card bordered header-bordered`         | `src/components/AccountSection.vue:21`                                                                                                                                                                                   |
| 第 2 层 | 每账号又一张 `t-card size="small" header-bordered` | `src/components/VolcPlanSection.vue:80-85`、`ZhipuSection.vue:103-108`、`DeepSeekSection.vue:28-33`、`GiteeSection.vue:77-82`、`AliyunSection.vue:61-66`、`TokenPlanSection.vue:114-119`、`VolcUsageSection.vue:103-108` |
| 第 3 层 | 手写 `.window-block`（1px 边框 + 圆角 div）        | `src/components/VolcPlanSection.vue:237-241`、`ZhipuSection.vue:275-279`、`ExtraSection.vue:160-164`                                                                                                                     |

实测三层的视觉参数完全相同：外卡与内卡背景同为 `rgb(36,36,36)`、边框同为 `rgb(94,94,94)`、圆角同为 6px、阴影均为 none。**层级没有拉开，只有「线」在增加**。这是 2015 年 Bootstrap panel 时代的做法；TDesign 官方仪表盘示例（tdesign.tencent.com/starter 模板）的卡片语言是：**只有一层 Card 描边，卡内分组用 `--td-bg-color-secondarycontainer` 浅色块或纯间距，绝不逐层描边**。

设计规范依据：`design-spec.md` 间距与密度一节「同一页面内圆角、阴影和边框层级保持统一」；`tokens.md` 高频组合「内容卡片 = container 背景 + 1px stroke」，没有「卡片里再画卡片」的组合。

### 根因 2：数据数字没有统一语言 —— 四套手写大数字 + 标签墙

TDesign 的 `t-statistic` 自带完整的大数字排版（实测默认：数值 28px / 标题 14px secondary / 后缀 18px），但项目只在一半地方用了它，另一半手写 div：

| 手写数字样式            | 位置                                      | 实测值                    |
| ----------------------- | ----------------------------------------- | ------------------------- |
| `.summary-value`        | `src/components/OverviewTab.vue:520-524`  | 22px / 700                |
| `.reset-countdown`      | `src/components/OverviewTab.vue:501-505`  | 20px / 700                |
| `.text-stat-value`      | `src/components/ZhipuSection.vue:319-322` | 18px / 700                |
| `.nav-primary`          | `src/components/OverviewTab.vue:544-548`  | 16px / 600                |
| （对照组）`t-statistic` | DeepSeek/Gitee/VolcUsage 各 Section       | 28px / 400（medium 字族） |

同一页面出现 18/20/22/28 四种「大数字」，字重 600/700 混用 —— 数字是仪表盘的第一主角，主角没有统一服装，页面立刻显得拼凑。

实测字号直方图（套餐订阅 Tab，按叶节点统计）：**14px×91、12px×37、16px×4、28px×4**。全页 90% 文本是正文+灰色辅助，缺少标题层与数字层的对比度 —— 这是「平、灰、旧」观感的直接来源（规范要求至少「页面标题/区块标题/正文/辅助」四级层次，`visual-consistency-web.md` 排版层级一节）。

**标签墙**：余额 Tab 实测 13 个 `t-tag` 全部 `light-outline` 变体：账号名是 tag（`VolcPlanSection.vue:88-90`）、套餐类型是 tag（`:92-99`）、状态是 tag、计费类型是 tag（`:211-217`）、provider 计数是 tag（`App.vue:135-143`）。`light-outline` 是弱描边样式，大面积使用后整个页面布满细线小胶囊，与根因 1 的边框汤叠加。TDesign 用法上 tag 只承担「状态/分类标注」，**账号名这种主体身份应该是标题文本**，不是胶囊。

### 根因 3：没有按「仪表盘模板」组织页面 —— Tabs 当整站导航、无页面头、间距失拍

1. **`t-tabs theme="card"` 承载 4 个一级模块**（`src/App.vue:148`）。offices.md 禁止行为明列：「禁止用面包屑、步骤条或 Tabs 替代整站主导航」。card 主题 Tabs 是模块内区域导航组件，被当成整站导航后：页面没有真正的导航栏形态，且 Tabs 随内容滚动消失（实测页面高 3103px/3156px，滚到明细表处导航已不可见）。
2. **自定义双行 header，高 89px**（实测；`App.vue:106-145` + `:259-299` 手写 flex/padding）。规范要求 Header 用 `--td-comp-size-xxxl`（56px，实测 token 存在）。第二行 provider-tags（`App.vue:134-144`）是纯展示的标签墙，与总览 Tab 的「平台总览」「平台导航卡」信息重复三连。
3. **间距档位散乱**：同页 gutter `[16,16]` 与 `[12,12]` 混用（`App.vue:154` vs `OverviewTab.vue:417`）；零散 margin：`.coding-block margin-top:16px`（`VolcPlanSection.vue:265-267`）、`.section-head margin-bottom:12px`（`:269-271`）、`.window-foot margin-top:4px`（`:261-263`）、`.grid-row margin-top:4px`（`App.vue:307-309`）。规范：「同一页面只保留 1-2 个主间距档位（16+24 或 24+32）」，当前 4/6/8/12/16 五档齐飞，页面节奏感被破坏。
4. **区块标题层级混乱**：`t-divider align="left"` 带文字被当 section 标题用（`VolcPlanSection.vue:193-198`、`ZhipuSection.vue:192/236`、`GiteeSection.vue:125/142`、`TokenPlanSection.vue:147/177`、`OverviewTab.vue:416`），实测 divider 文字仅 14px 正文级。结果：卡内「Coding Plan 套餐额度」「模型调用明细」这些真实区块标题比卡片标题（16px/600）低两级还带一条横线，标题体系断裂。
5. **信息密度失控**：每账号卡平铺「额度窗口 ×N + Coding Plan 窗口 ×N + 明细表格」无折叠（`VolcPlanSection.vue:114-219`），一张账号卡近 800px 高。多账号时整页 3000px+ 长滚动，没有 t-collapse / 卡内 Tabs 收纳。

---

## 二、布局架构判定

**判定：维持上下结构（顶部导航），但必须把 `t-tabs` 换成官方 `HeadMenu`（`t-head-menu`）。**

按 offices.md 页面布局选择表逐条比对：

| 判定条件                        | 本项目情况                                       | 结论      |
| ------------------------------- | ------------------------------------------------ | --------- |
| 功能模块数量 < 9 → 上下结构     | 一级模块 4 个（总览/套餐订阅/余额账户/扩展平台） | ✅ 上下   |
| 模块关联较弱 / 需明确区分       | 套餐与余额是两类数据，弱关联                     | ✅ 上下   |
| 左右结构条件：模块多 + 频繁切换 | 4 个模块、监控型低频切换                         | ❌ 不满足 |
| 混合结构条件：有父子层级        | 无二级导航                                       | ❌ 不满足 |

所以**不需要**上左侧 Menu + Layout 侧栏 —— 4 个弱关联模块用左右结构反而浪费横向空间、显得空荡。当前方向错在组件选型而非结构选型：整站导航必须用 `Menu`（Web 顶部形态即 `t-head-menu`），Tabs 降级回模块内区域导航（例如账号卡内「额度 / 调用明细」切换）。

**推荐应用壳**（全部官方组件，`design-spec.md` 页面结构一节）：

```
t-layout
 ├─ t-header（height = var(--td-comp-size-xxxl)，sticky）
 │   └─ t-head-menu（logo 位「LLM 用量监控」+ 4 个一级菜单项 + 右侧 t-space 操作区：
 │        更新时间 / t-switch 自动刷新 / 主题切换 / 刷新按钮）
 └─ t-content（max-width 容器 + var(--td-size-8) 安全边距）
     └─ 页面头（page header：当前模块名 + 关键指标 t-statistic 行）
         └─ 内容卡片栅格（t-row gutter 统一 [16,16]）
```

附带收益：sticky 的 HeadMenu 让 3000px 长页面上导航常驻；89px 双行 header 收敛为 56px 标准高度；provider-tags 行删除（信息由总览 Tab 承担）。

---

## 三、组件用法纠正清单

| #   | 现状                                                                                                                                                      | 问题                                                                | TDesign 正确用法                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `t-tabs theme="card"` 当整站导航（`App.vue:148`）                                                                                                         | 违反 offices.md「禁止 Tabs 替代整站主导航」；导航随滚动消失         | `t-head-menu` + `t-menu-item` ×4；`v-model` 绑模块切换，等价改造成本低（都是 value 驱动）                                                                                                                                                   |
| 2   | 双层 t-card：AccountSection 外卡（`AccountSection.vue:21`）内再套账号卡（各 Section）                                                                     | 三层盒子同 border/bg/radius，层级全靠线（实测 37 个描边元素）       | 外层保留 `t-card`；账号层**去 Card 化**：账号头用 `t-space` + 标题文本，账号之间用 `t-divider`（无文字）或 `t-list` 分隔；确需容器感时用 `background: var(--td-bg-color-secondarycontainer)` 色块而非描边                                   |
| 3   | `.window-block` 手写 1px 边框块（`VolcPlanSection.vue:237-241`、`ZhipuSection.vue:275-279`、`ExtraSection.vue:160-164`）                                  | 自造迷你卡片，边框汤第三层                                          | 去边框，改 `background: var(--td-bg-color-secondarycontainer); border-radius: var(--td-radius-medium); padding: var(--td-size-5) var(--td-size-6)`；内容 = 标题行（`t-space justify space-between`）+ `t-progress` + `t-statistic` 小号数值 |
| 4   | 手写大数字 `.summary-value`/`.reset-countdown`/`.text-stat-value`/`.nav-primary`（`OverviewTab.vue:501-505,520-524,544-548`、`ZhipuSection.vue:319-322`） | 18/20/22px 四套字号 + 600/700 字重，与 `t-statistic` 28px 并存      | 全部换 `t-statistic`：预警卡计数用 `t-statistic`（`color` prop 表危险态），最近重置卡数值列用 `t-statistic`，信用支付状态用 `t-statistic` 或 `t-tag`                                                                                        |
| 5   | `.alert-row` 手写可点击 div 列表（`OverviewTab.vue:330-361`，样式 `:448-493`）                                                                            | 手写 hover/focus/键盘逻辑，重造列表控件（违反「禁止手写等价控件」） | `t-list` + `t-list-item`（默认带 hover 态）；行内布局：左 `t-tag`（百分比）+ 平台/账号文本 + 右侧 `resetText`；点击跳转放 `t-list-item` 的 click。超过 8 条的截断保留                                                                       |
| 6   | provider-tags 标签墙行（`App.vue:134-144`）                                                                                                               | 与总览「平台总览」「导航卡」信息三重冗余；撑高 header 到 89px       | 删除该行；如需保留全局感，把已配置平台数并入 HeadMenu 右侧一个 `t-tag` 或总览页面头                                                                                                                                                         |
| 7   | 账号名用 `t-tag theme="primary" light-outline`（`VolcPlanSection.vue:88-90` 等 7 处）                                                                     | 主体身份被降格为胶囊，制造标签墙（实测 13 个 light-outline tag）    | 账号名改标题文本：`font: var(--td-font-title-small)`（14px medium）；keyHint 用 `body-small` + placeholder 色；套餐/状态保留 tag（这是 tag 的正当用途）                                                                                     |
| 8   | `t-divider align="left"` 带文字当区块标题（6 处，见根因 3-4）                                                                                             | 区块标题只有 14px 正文级且带横线，标题体系断裂                      | 卡内子区块标题改为纯文本：`font-size: var(--td-font-size-title-small)`、`font-weight` 用 medium 字族，标题下方 `var(--td-size-4)` 间距；仅在没有标题的纯分隔处保留 `t-divider`                                                              |
| 9   | `t-progress :label="false"` 后又手写两处百分比（`VolcPlanSection.vue:180-183`、`ExtraSection.vue:126-129`「已用 87.4% … 87.4%」）                         | 同一数字一行出现两次                                                | 保留 `:label="false"`，meta 行只留一处百分比 + used/quota 数值；或用 label 默认渲染删手写                                                                                                                                                   |
| 10  | `t-statistic` 标题与后缀重复货币（`DeepSeekSection.vue:60-65`：title「CNY 总余额」+ suffix「CNY」）                                                       | 视觉重复                                                            | title 去「CNY」，仅留 suffix；或 title 留货币删 suffix                                                                                                                                                                                      |
| 11  | `t-card` 整卡当按钮（`OverviewTab.vue:419-432` role="button" tabindex）                                                                                   | 卡片承担跳转语义但无组件支撑                                        | 保留 Card + `hover-shadow`，但改为：卡内 `t-statistic`（primary 值）+ 名称行 + `t-chevron-right-icon` 指示可点；语义上包一层可聚焦容器或保留现有 role（现有键盘处理已完备，主要是视觉要像可点）                                             |
| 12  | `t-switch :label="['自动','手动']"`（`App.vue:111-116`）                                                                                                  | 两侧文字标签占宽、与「更新于 xx:xx」挤在一行                        | 保留 switch 但去 label 数组，改单侧「自动刷新」文本（`body-small`）或 `t-tooltip` 说明                                                                                                                                                      |
| 13  | `.anchor-flash` 用 `--td-brand-color` outline（`App.vue:321-325`）                                                                                        | 可用但语义不准                                                      | 改 `var(--td-brand-color-focus)` 背景闪 + `--td-component-stroke` 描边，或保持现状（低优先级）                                                                                                                                              |
| 14  | `t-empty` 未配置密钥态（`AccountSection.vue:31`）                                                                                                         | 空态只有文字，无出路                                                | `t-empty` 加操作引导（`t-button` variant=text 指向 .env.example 说明），提升新手引导（仪表盘模板「新手指引」高频任务）                                                                                                                      |
| 15  | `t-table bordered size="small"` 全线框（各 Section 明细表）                                                                                               | bordered 表格 + 边框汤叠加                                          | 明细表去掉 `bordered`（TDesign 表格默认横线风格更现代），保留 `size="small"` + 右对齐数值列（已做）                                                                                                                                         |

---

## 四、Token 化重构方案

### 4.1 自定义 CSS 清除映射表

**App.vue（`src/App.vue:253-325`，9 处 scoped 规则）**

| 现状                                       | 处置               | 替代写法                                                                                                                               |
| ------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `.app-layout` 背景（`:254-257`）           | 删                 | `t-layout` 自带；body 已设 `--td-bg-color-page`                                                                                        |
| `.app-header` 全部（`:259-265`）           | 删                 | `t-header`：`height/min-height: var(--td-comp-size-xxxl); flex-shrink: 0`（组件尺寸 token，见 tokens.md 应用壳组合）                   |
| `.header-inner`（`:267-276`）              | 删                 | `t-head-menu` 内置 logo 位 + operations 插槽（`#operations` 放操作区）                                                                 |
| `.app-title` 18px/600（`:278-283`）        | 删                 | HeadMenu logo 区文本，字号走组件默认；确需强调用 `var(--td-font-size-title-large)`                                                     |
| `.last-updated` 12px（`:285-290`）         | 保留结构、Token 化 | `font-size: var(--td-font-size-body-small); color: var(--td-text-color-placeholder)`（去掉硬编码 12px）                                |
| `.provider-tags`（`:292-299`）             | 删                 | 整行删除（见纠正清单 #6）                                                                                                              |
| `.app-main` padding 16/24/48（`:301-305`） | Token 化           | `padding: var(--td-size-6) var(--td-size-8) var(--td-size-13)`（或引入页面头后 `var(--td-size-8) var(--td-size-8) var(--td-size-13)`） |
| `.grid-row` margin-top:4px（`:307-309`）   | 删                 | gutter 已提供间距                                                                                                                      |
| `.app-footer`（`:311-319`）                | Token 化           | 字号 `var(--td-font-size-body-small)`；或改 `t-footer`                                                                                 |
| `.anchor-flash`（`:321-325`）              | Token 化           | outline 色改 `var(--td-brand-color)`（已是）→ 建议补 `background: var(--td-brand-color-light)` 过渡                                    |

**OverviewTab.vue（`src/components/OverviewTab.vue:443-560`，15 处）**

| 现状                                                                     | 处置             | 替代写法                                                                            |
| ------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| `.alert-list` / `.alert-row` / `:hover` / `:focus-visible`（`:448-470`） | 删               | `t-list` / `t-list-item` 组件接管 hover 与焦点                                      |
| `.alert-platform` 13px/600（`:472-476`）                                 | 删               | 列表项主文本，组件默认 14px                                                         |
| `.alert-account` / `.alert-window` 12px secondary（`:478-482`）          | Token 化并入结构 | `var(--td-font-size-body-small)` + `var(--td-text-color-secondary)`（若留文本节点） |
| `.alert-reset`（`:484-489`）                                             | 删               | `t-list-item` 内容排版                                                              |
| `.reset-countdown` 20px/700（`:501-505`）                                | 删               | `t-statistic`（值 + `format` 显示相对时间）                                         |
| `.summary-counts` / `.summary-item` / `.summary-value`（`:507-524`）     | 删               | `t-row` + 3×`t-statistic`（危险态用 `color` prop）                                  |
| `.nav-card` cursor/focus（`:530-537`）                                   | 保留 focus 态    | focus 色改 token（已是 brand）；cursor 保留（Card 无 hover-cursor prop）            |
| `.nav-name` 13px（`:539-542`）                                           | Token 化         | `var(--td-font-size-body-small)`                                                    |
| `.nav-primary` 16px/600（`:544-549`）                                    | 删               | `t-statistic` 或 `var(--td-font-size-title-medium)` + medium 字族                   |
| `.muted` 12px（`:556-559`）                                              | Token 化         | `font-size: var(--td-font-size-body-small)`（去硬编码）                             |

**各 Section（共 ~20 处，同类项合并）**

| 现状                                                                                                                                              | 处置     | 替代写法                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.window-block` 边框（`VolcPlanSection.vue:237-241`、`ZhipuSection.vue:275-279`、`ExtraSection.vue:160-164`）                                     | 改写     | `background: var(--td-bg-color-secondarycontainer); border: none; border-radius: var(--td-radius-medium); padding: var(--td-size-5) var(--td-size-6)` |
| `.window-head/.window-meta/.window-foot` 零散 margin（4px/8px/12px）                                                                              | 收敛     | 统一 `t-space direction="vertical" size="small"`（8px），删除手写 margin                                                                              |
| `.coding-block margin-top:16px` / `.section-head margin-bottom:12px`（`VolcPlanSection.vue:265-271`）                                             | 删       | `t-space size="large"`（16px）组织纵向节奏                                                                                                            |
| `.num` tabular-nums/600（3 个文件重复定义）                                                                                                       | 收敛     | 数值列右对齐 + `t-statistic`；确需保留则字重交组件，只留 `font-variant-numeric: tabular-nums`（允许的最小业务 CSS）                                   |
| `.muted` 12px（6 个文件重复定义）                                                                                                                 | 收敛     | 全局一处工具类或组件内 `body-small` token 写法                                                                                                        |
| `.account-range` / `.key-hint` / `.account-name`（`VolcPlanSection.vue:232-235`、`VolcUsageSection.vue:166-169`、`TokenPlanSection.vue:217-220`） | Token 化 | `var(--td-font-size-body-small)` + placeholder/secondary token                                                                                        |
| `.text-stat` / `.text-stat-label` / `.text-stat-value`（`ZhipuSection.vue:308-322`）                                                              | 删       | `t-statistic`（文本值走 `format`）                                                                                                                    |
| `.summary-counts` 的 `justify-content: space-around`                                                                                              | 删       | `t-row :gutter` 栅格                                                                                                                                  |
| `.group-head`（`ExtraSection.vue:152-158`）                                                                                                       | 改写     | 标题 `var(--td-font-size-title-small)` + 右侧计数 tag；去手写 flex                                                                                    |
| `.balance-detail` / `.extra-detail` margin-top:8px                                                                                                | Token 化 | `margin-top: var(--td-size-4)`                                                                                                                        |

**预计清除结果**：约 45 处 scoped 规则 → 保留 ~12 处（焦点态、tabular-nums、max-width、锚点闪烁等「允许的最小业务 CSS」），其余全部由组件 props、布局组件与 `--td-*` 变量接管。

### 4.2 字号 / 间距 / 圆角 / 颜色 Token 映射表

**字号（四级层次，全部走 token）**

| 层级           | Token / 组件                                                                | 用在哪                                                     |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 页面/品牌标题  | `--td-font-size-title-large`（18px，HeadMenu logo 区组件默认）              | 「LLM 用量监控」                                           |
| 区块标题       | 组件默认 16px/600（`t-card` title，勿覆盖）                                 | 各区块卡标题                                               |
| 卡内子区块标题 | `--td-font-size-title-small`（14px，medium 字族 `--td-font-family-medium`） | 「Coding Plan 套餐额度」「模型调用明细」「余额」「资源包」 |
| 大数字         | `t-statistic` 默认（28px/400 medium 字族）                                  | 所有指标值，危险态走 `color` prop，不再手写 18/20/22px     |
| 正文           | `--td-font-size-body-medium`（14px，组件默认）                              | 表格、列表主体                                             |
| 辅助           | `--td-font-size-body-small`（12px）+ `--td-text-color-secondary`            | keyHint、重置时间、说明                                    |
| 占位           | 同上 + `--td-text-color-placeholder`                                        | 更新时间、muted 类                                         |

**间距（收敛到「16 + 24」两档主节奏）**

| 场景                      | 现状                         | 目标                                                            |
| ------------------------- | ---------------------------- | --------------------------------------------------------------- |
| 页面水平安全边距          | 24px 硬编码（`App.vue:304`） | `var(--td-size-8)`                                              |
| 卡片栅格 gutter           | `[16,16]` 与 `[12,12]` 混用  | 统一 `[16,16]`（`--td-size-6`）                                 |
| 大区块间距 / 页面头与主体 | 零散                         | `var(--td-size-8)`～`var(--td-size-10)`                         |
| 卡内纵向节奏              | 4/6/8/12/16 混用             | `t-space`：small(8) / medium(16) 两档，删除 4px/6px 手写 margin |
| 底部留白                  | 48px 硬编码                  | `var(--td-size-13)`                                             |

**圆角**

| 场景                        | 目标                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| 卡片                        | `t-card` 组件默认（实测 6px = `--td-radius-medium`，勿覆盖）✅ 已符合 |
| 卡内色块（原 window-block） | `var(--td-radius-medium)`                                             |
| 控件                        | 组件默认（`--td-radius-default`）✅                                   |

**颜色（现状已 80% Token 化，补三条策略）**

| 场景       | 目标                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 卡内分组底 | `var(--td-bg-color-secondarycontainer)`（替代描边表达层级）                                          |
| hover      | `var(--td-bg-color-container-hover)`（t-list 自带，删手写）                                          |
| 边框       | 仅保留最外层 Card 一层 `--td-component-stroke`；内层一律去描边                                       |
| 危险数字   | `t-statistic` `color` / `--td-error-color`，且必须伴随文案（状态不只靠颜色）✅ 现有 tag+文本做法保留 |

---

## 五、分优先级改造清单

### P0 —— 视觉质感飞跃（先做，1 天内可完成，不涉及导航结构）

1. **拆双层卡片**：7 个 Section 的账号层去 Card 化，改 divider/secondarycontainer 分组（纠正清单 #2）。
2. **统一大数字**：OverviewTab 四处 + ZhipuSection `.text-stat` 全部换 `t-statistic`（#4）。
3. **window-block 去边框改色块**：3 个文件的 `.window-block` 改 secondarycontainer 背景（#3）。
4. **预警列表 t-list 化**：删 `.alert-row` 手写列表（#5）。
5. **明细表去 bordered**：所有 `t-table` 移除 `bordered` prop（#15）。

### P1 —— 结构正确性（第二波，涉及应用壳）

6. **HeadMenu 替换 t-tabs 整站导航** + `t-header` 56px token（#1、根因 3-1/3-2）。
7. **删除 provider-tags 行**（#6）。
8. **间距档位收敛**：gutter 统一 `[16,16]`，删零散 margin，改 `t-space` 驱动（4.2 间距表）。
9. **divider-标题 → title-small 真标题**：6 处（#8）。
10. **progress 重复百分比删除**（#9）；账号名去 tag 化（#7）。
11. **t-switch 标签简化**（#12）。

### P2 —— 打磨

12. Statistic 货币后缀去重（#10）；空态加引导按钮（#14）；anchor-flash 语义色（#13）。
13. 导航卡 chevron 指示（#11）；footer token 化。
14. 暗色模式复查：P0 完成后核对 secondarycontainer 色块在暗色下的层次（本次实测暗色三盒同色问题将随去边框自然消解）。

---

## 六、预期效果描述

改造完成后的页面（想象 1440px 视口）：

- **进入即仪表盘**：56px 标准 HeadMenu 常驻顶部——左端「LLM 用量监控」品牌位，中间 4 个一级菜单，右端「更新于 14:32 / 自动刷新 / 主题 / 刷新」操作组；导航不再随长页面滚动消失。
- **总览页一眼看清**：预警卡内是 t-list 行式列表（tag 百分比 + 平台/账号 + 右侧重置时间），右侧「最近重置」「平台总览」用统一的 28px t-statistic 大数字，危险计数带 error 色与文案双通道；下方导航卡是 hover 浮起的浅阴影卡 + 大数字 + chevron。
- **详情页只有一层卡片**：每平台一张 Card；卡内账号用「账号名标题（14px medium）+ keyHint 小字 + 状态 tag」一行头，账号间一条静默 divider；额度窗口是浅灰蓝（secondarycontainer）圆角色块，内嵌细进度条与统一大数字——**整页描边元素从 37 个降到 ~10 个，层级靠背景深浅而非线条**。
- **数字语言统一**：全站所有指标都是同一套 28px medium 大数字，表格数值右对齐 tabular-nums，百分比只在进度条旁出现一次。
- **节奏感**：16/24 两档间距呼吸均匀，区块标题 14px medium 清晰锚定每个数据分组，页面从「灰色文字海 + 细线格子」变成「白卡浮于浅灰底、色块分区、大数字点睛」的现代监控台——这正是 TDesign 官方仪表盘模板（Starter Dashboard）的标准观感。
