# LLM 用量监控（tracking-llm-plan-usage）

**简体中文** | [English](README.en.md)

[![CI](https://github.com/KS-OTO/tracking-llm-plan-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/KS-OTO/tracking-llm-plan-usage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2%2B-black?logo=bun)](https://bun.sh)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white)](https://vuejs.org)
[![TDesign Vue Next](https://img.shields.io/badge/TDesign-Vue%20Next-0052d9)](https://tdesign.tencent.com/vue-next/)
[![Node](https://img.shields.io/badge/Node-%5E22.18%20%7C%7C%20%3E%3D24.12-339933?logo=node.js&logoColor=white)](package.json)
[![Demo](https://img.shields.io/badge/Demo-cp--ai101.18bit.cn-2ea44f)](https://cp-ai101.18bit.cn/)
[![Docs](https://img.shields.io/badge/Docs-Wiki-0052d9?logo=github)](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki)

把 **DeepSeek、火山方舟、智谱、阿里云百炼、模力方舟、百度千帆、OpenRouter、New API**（自托管网关）
以及 **Kimi / MiniMax / OpenCode Go** 订阅套餐的余额与额度窗口，收进**一个页面**。
凭据只存在服务端环境变量里，浏览器拿不到任何 Key。

> **在线演示：<https://cp-ai101.18bit.cn/>** ·
> **用户手册（Wiki）：<https://github.com/KS-OTO/tracking-llm-plan-usage/wiki>**

![套餐订阅 Tab：窗口用量条与多 Key 并列](docs/images/plans-dark.png)

<sub>截图为「套餐订阅」Tab。同屏浅色主题见 [`plans-light.png`](docs/images/plans-light.png)，
「余额账户」Tab 见 [`accounts-dark.png`](docs/images/accounts-dark.png)。</sub>

## 这个项目是什么

这些平台的余额和额度分散在各自的控制台里，有的甚至不提供查询 API（只能靠控制台会话 Cookie）。
想知道「这个月还够不够用」，得逐个登录。本项目把这件事收敛成 **一次请求、一个页面**，
所有凭据交互都在服务端完成。

它**不是**代理网关：不转发模型请求、不记录对话内容，只做「读余额、读用量」这一件事。

它**没有**内建的用户体系：部署到公网后任何知道地址的人都能看到读数，生产使用必须在反代层加认证
（见 [安全](#安全)）。

## 快速开始

```bash
git clone https://github.com/KS-OTO/tracking-llm-plan-usage.git
cd tracking-llm-plan-usage
bun install
cp .env.example .env      # 只填你想看的平台，其余留空
bun run dev               # 单进程：前端 5173 + 内置 API（读取 .env）
```

打开 <http://localhost:5173>。

**一个 Key 都不填也能起来** —— 页面会为每家平台渲染「未配置」空态而不是报错。
填一个变量就点亮一张卡，不需要改代码、不需要重新构建。

| 你现在想做的事                       | 去哪                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 知道「最少要填哪几个变量」           | [快速开始 → 点亮第一张卡](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Getting-Started) |
| 查某个变量是什么意思                 | [配置参考](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)                  |
| Cookie / 多账号 / 别名怎么配         | [凭据与多账号](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Credentials)                |
| 部署上线（Workers / EdgeOne / 其他） | [部署](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)                         |
| 起不来、卡片不出现、会话「失效」     | [排查](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Troubleshooting)                    |

## 支持的平台

| 平台                  | 能看到什么                                                                   | 需要的凭据                                                 |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| DeepSeek              | 总余额 / 充值余额 / 赠金余额（CNY·USD）、可用状态                            | `DEEPSEEK_API_KEY`                                         |
| 火山方舟 Agent Plan   | 5 小时 / 每周 / 每月配额与进度、重置倒计时；套餐档位、模型调用明细、推理用量 | `VOLC_ACCESS_KEY_ID` + `VOLC_SECRET_KEY`                   |
| 智谱 GLM              | Coding Plan 等级与 5 小时 / 每周窗口额度、账户余额、Token 资源包             | `ZHIPU_API_KEY`                                            |
| 阿里云百炼            | Token 资源包（总量 / 剩余 / 有效期）                                         | `ALIYUN_ACCESS_KEY_ID` + `ALIYUN_SECRET_KEY`               |
| 阿里云百炼 Token Plan | 组织 / 座席 / 共享包额度；**个人版** 5 小时 / 7 天窗口用量、加购包           | 同上（团队版）；个人版另加 `ALIYUN_TOKENPLAN_COOKIE`       |
| 模力方舟（Gitee AI）  | 资源包总 / 已用 / 剩余、代金券余额与明细                                     | `GITEE_AI_API_KEY`；代金券需 `GITEE_AI_SESSION_COOKIE`     |
| 百度智能云千帆        | 量包（总量 / 已用 / 到期）、TPM 配额、近 7 天调用概览                        | `BAIDU_ACCESS_KEY_ID` + `BAIDU_SECRET_KEY`                 |
| OpenRouter            | 剩余额度 / 限额剩余 / 今日用量；充值总额、周月用量在详情弹窗                 | `OPENROUTER_API_KEY`                                       |
| New API（自托管）     | **订阅**（周期额度窗口）或 **钱包**（剩余 / 累计已用 / 请求数）              | `NEWAPI_BASE_URL` + `NEWAPI_TOKEN`（多站点加 `_2` / `_3`） |
| 订阅套餐              | Kimi / MiniMax / OpenCode Go 的按窗口订阅额度                                | `KIMI_API_KEY` / `MINIMAX_API_KEY` / `OPENCODE_GO_API_KEY` |

**全部为可选**：配齐哪几家就显示哪几家。密钥只存在于服务端环境变量，前端只渲染掩码。
各平台的接口、字段语义、实测口径与已知限制见
[平台支持](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Providers)。

## 部署

`server/app.ts` 是平台无关的（只依赖 Web Fetch API 与 Web Crypto），
所以「单一 HTTP 入口 + 环境变量注入」的平台都能承载。

| 平台                    | 怎么部署                                                            | 指南                                                                                 |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Cloudflare Workers      | `bun run deploy`（= `vp build && wrangler deploy`），密钥走 secrets | [部署 → Workers](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)  |
| EdgeOne Makers          | 控制台把函数目录指向 `cloud-functions/`                             | [部署 → EdgeOne](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)  |
| Vercel / 其他 Node 宿主 | 照 `cloud-functions/api/[[default]].js` 写一个 `api/` 适配层        | [部署 → 其他平台](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment) |
| 本机 / 内网服务器       | `vp build` 后 `bun run server`，同一端口提供 API 与静态页           | [部署 → 自托管](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)   |

平台面板配置变量时有两条硬约束（**值不能含空格/换行**、**面板不做 `$` 展开**），
配之前请先读 [Cookie 怎么填](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Credentials)。
改完变量**必须重新部署**才对已运行的实例生效。

> ⚠️ 部署到公网前先读 [安全](#安全)：本项目**没有**内建访问控制。

## 配置

所有变量都在 `.env.example` 里有注释版模板；`.env` 是你的真实值（gitignored，不入库）。
最常用的一组：

| 变量                       | 说明                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `<平台>_API_KEY`           | 各平台的 Key / AK（见上表），**全部可选**                     |
| `<平台>_LABEL`             | 账号别名，多 Key 时卡片主标题显示它（见下）                   |
| `SITE_NAME`                | 站点名，默认「LLM 用量监控」；**显式留空**则品牌位只显示 Logo |
| `SITE_LOGO_URL`            | 明亮模式 Logo 地址（须 https）                                |
| `SITE_LOGO_URL_DARK`       | 暗黑模式专用 Logo；未配则沿用 `SITE_LOGO_URL`                 |
| `SITE_FAVICON_URL`         | 标签页图标（须 https）                                        |
| `REFRESH_INTERVAL_SECONDS` | 前端自动刷新间隔（秒），默认 `180`，允许 10–3600              |

- **完整变量总表**（含 `HOST` / `PORT` / `NEWAPI_USER_ID` 等）→
  [配置参考](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)
- **站点自定义**（Logo 高度与断点、留空 vs 不配的差别、加载失败如何降级）→
  [站点自定义](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration#站点自定义)

三条最容易踩的坑，先说在前面：

1. **多账号按序号连续编号**：`PREFIX`、`PREFIX_2`、`PREFIX_3`……**遇到缺口即停**。
   有 `_1` 和 `_3` 却没有 `_2`，后续组全部读不到。成对凭据（AK/SK）同编号成组。
2. **别名按序号配对，不按值配对**：`*_LABEL_2` 对应的是第 2 组凭据。
3. **本地 `.env` 会展开 `$`**：字面 `$` 必须写成 `\$`，否则**静默损坏**（加引号无效）。
   平台上相反 —— 直接粘原值，**不要**加反斜杠。

环境变量的**单一事实来源**是 `server/env-vars.ts`：新增平台要同时改它、`.env.example` 与
`.dev.vars.example`，`server/env-vars.test.ts` 会断言漂移 —— 不会出现「文档写着有、配了却不生效」。

## 功能

- **响应式多列布局**：桌面多列、平板两列、手机单列；平台按「套餐订阅 / 余额账户」Tab 分组。
  布局只由 `src/assets/layout.css` 的语义化网格原语决定（组件不写断点），
  **每一层卡片都铺满上一层给它的高度**，所以区块卡 → 账号卡 → 窗口块三层严格等高；
  卡内挂了 ≥2 个 Key 的区块自动**独占整行**，多个 Key 并排而不是被挤成一行一个。
- **卡片只放高优先级读数**：只有窗口用量 / 余额 / 状态这类每天要看的数字。
  账号身份、订阅元数据、明细表、次级指标全部收进卡片右上角的「详情」弹窗，需要时才展开。
- **平台卡排序**：Key 多的平台排前面（3 Key > 2 Key > 1 Key），数量相同时按平台名首字母 A→Z ——
  中文取拼音、拉丁名取字母，混在同一个序列里（阿里→A、百度→B、DeepSeek→D、OpenRouter→O、智谱→Z）。
- **「可用模型」直达文档**：每张卡的标题旁有「可用模型 ↗」，新标签打开该平台官方的模型 / 计费文档。
  链接按卡片标题在 `src/modelDocs.ts` 统一查表，同一平台在不同 Tab 标题不同也只需一条映射。
- **刷新节奏可预期**：顶部同时显示「更新于 HH:MM:SS」与「下次刷新 HH:MM:SS」；
  关掉自动刷新或页面切到后台时后者显示「已暂停」，不给一个根本不会到来的时间。
- **窄屏导航不溢出**：≤767px 时导航收成两行（品牌与操作同行、三个 Tab 等分第二行），
  时间文案下移到内容区顶部；锚点避让量跟着导航实际高度走，跳锚点不会把标题压在导航下面。
- **暗色模式**：一键切换并持久化（localStorage），默认跟随系统 `prefers-color-scheme`。
- **可访问性**：语义化地标（header/main/footer）、键盘可达、aria 标注；
  文字五档（含链接色）在亮 / 暗两套下全部按 WCAG AA（≥4.5:1）校验过，取值见 `src/assets/theme.css`。
- **骨架屏 / 错误告警 / 空状态**：统一由 TDesign Skeleton / Alert / Empty 承载。

### 对外接口只有 3 个

页面挂在边缘云上，而部分平台按**节点生存时间**计费 —— 端点数直接决定唤醒次数与单次存活时长。
因此所有读数合并成 3 个接口（此前是 13 个）：

| 接口                            | 何时调用             | 说明                                                                                       |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/status`               | 首屏一次             | 只回**配置状态**，**0 次上游调用**，因此极快                                               |
| `GET /api/usage`                | 每次刷新             | 10 家平台的读数合并成**一封信封**，每家是独立切片，一家失败不污染其余九家                  |
| `GET /api/volc/inference-usage` | 按需（改模型过滤时） | 火山推理用量。**故意不合并** —— 它是唯一带用户输入的接口，并入会让改一个过滤退化成全量重拉 |

服务端有 **TTL 缓存 + 单飞**：命中缓存时上游调用为 0，并发刷新共享同一次上游请求；
手动点「刷新」会绕过缓存（`?refresh=1`），因此手动刷新永远拿得到实时数据。
契约、信封形状与缓存分档见 [架构](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Architecture)。

## 开发

```bash
bun run dev            # 单进程开发：前端 5173 + 内置 API（读取 .env）
bun run dev:all        # 前端与后端分开跑（后端 8787）
bun run server         # 只跑生产用的 Bun 服务（同端口提供 API + dist/ 静态页）
```

**提交前按顺序跑完四道门禁**（CI 也是这个顺序，见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)）：

```bash
bun run test:unit      # 1. Vitest：签名向量 / 多账号读取 / 各平台 zod 解析 / 组件契约
bun run build          # 2. vue-tsc 严格类型检查 + Rolldown 构建
bun run test:e2e       # 3. Playwright 冒烟：空态 / 响应式 / 暗色 / 回到顶部
bunx vp check          # 4. Oxfmt + Oxlint + tsgolint —— 必须最后跑
```

一条命令跑完（顺序已固定，任一步失败即中断）：`bun run check`。

> 改了任意 `.vue` 文件，`build` 这道**必须**跑 —— `vp check` 不做模板类型检查。
> `bunx vp check --fix` 能自动修格式，但修完要**再跑一遍**确认 0 error / 0 warning。

动手前请读 [`CONTRIBUTING.md`](CONTRIBUTING.md)（代码铁律、PR 流程、凭据纪律），
设计决策写进 [`docs/design-baseline.md`](docs/design-baseline.md)，
开发环境的完整说明见 [开发指南](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Development)。

## 目录结构

```
server/           平台无关 API 核心 + Bun 入口（app.ts / cache.ts / 各平台客户端）
src/              Vue 3 前端（TDesign Vue Next + Pinia）
  components/     各平台区块组件 + *Detail.ts 适配器（平台响应 → AccountDetail）
  assets/layout.css  全站唯一布局层（语义化网格原语 + 断点）
  assets/theme.css   全站唯一配色入口（覆盖 TDesign 的 --td-*，亮 / 暗各一套）
e2e/              Playwright E2E 冒烟
worker/           Cloudflare Workers 入口（复用 server/app.ts）
cloud-functions/  EdgeOne Makers 云函数
docs/             设计系统规格 + 供应商接口调研
.github/          CI（四道门禁）+ issue / PR 模板 + Dependabot
```

根目录另有 [`LICENSE`](LICENSE) / [`SECURITY.md`](SECURITY.md) / [`CONTRIBUTING.md`](CONTRIBUTING.md) /
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)，以及环境变量模板 `.env.example` / `.dev.vars.example`。
逐文件说明见 [架构 → 目录结构](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Architecture)。

## 安全

### ⚠️ 本项目没有内建的用户体系与访问控制

部署到公网后，**任何知道地址的人都能看到你所有账号的余额与用量**。
生产使用时请在反向代理层加认证（Cloudflare Access / Basic Auth / IP 白名单），
或者干脆只在内网部署。

### 凭据只存在于服务端

前端是纯静态页面，第三方 Key / Cookie / Token 只从服务端环境变量读取，**从不下发到浏览器**
（页面只展示掩码）。请使用最小权限：火山用 IAM 子用户、阿里云用 RAM 子用户，
不要把主账号密钥填进来。

### 报告漏洞

**不要**开公开 issue。请走 Security → Advisories →
[Report a vulnerability](https://github.com/KS-OTO/tracking-llm-plan-usage/security/advisories/new)。
威胁模型、响应时限与仓库自身的凭据纪律见 [`SECURITY.md`](SECURITY.md) 与
[安全模型](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Security)。

如果你在本仓库的**任何位置（包括历史提交）**里发现真实凭据，同样按凭据泄漏处理 ——
历史泄漏也是泄漏。

## 文档

| 文档                                                                               | 内容                                                       |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [快速开始](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Getting-Started) | 跑起来、配第一个平台、看到第一张卡                         |
| [配置参考](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)   | 全部环境变量、站点自定义、刷新间隔                         |
| [凭据与多账号](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Credentials) | Cookie 怎么填、`$` 转义、多账号编号、账号别名、各平台权限  |
| [部署](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)          | Workers / EdgeOne / Vercel / 自托管，以及平台面板的硬约束  |
| [平台支持](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Providers)       | 每家的接口、字段语义、实测口径与已知限制                   |
| [架构](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Architecture)        | 3 个接口的契约、错误信封、TTL 缓存分档、目录结构           |
| [开发指南](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Development)     | 环境搭建、门禁、代码铁律、PR 流程、测试约定                |
| [设计系统](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Design-System)   | token 纪律、数值精度模型、列策略、主题层与对比度基准       |
| [安全模型](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Security)        | 威胁模型、凭据只存服务端的边界、报告漏洞                   |
| [排查](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Troubleshooting)     | 起不来 / 卡片不出现 / 会话「失效」/ Logo 不显示 / 面板拒绝 |
| [`docs/design-baseline.md`](docs/design-baseline.md)                               | 设计系统的权威规格（与代码同步演进）                       |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md)                | 贡献与安全（仓库内，随代码一起 review）                    |

## 许可证

[MIT](LICENSE) © 2026 KS-OTO

## 致谢

- UI 组件库：[TDesign Vue Next](https://tdesign.tencent.com/vue-next/)
- 工具链：[Vite+](https://viteplus.dev/)（Oxfmt / Oxlint / tsgolint / Vitest / Rolldown）、[Bun](https://bun.sh)
- 火山引擎签名实现参考：[字节跳动官方文档](https://www.volcengine.com/docs/6369/67269)
- 阿里云百炼 Token Plan 用量实现参考：[modelstudioai/cli](https://github.com/modelstudioai/cli)
- OpenCode Go 用量语义参考：[cc-switch PR #6547](https://github.com/farion1231/cc-switch/pull/6547)、[axonhub PR #2204](https://github.com/looplj/axonhub/pull/2204)
- New API 订阅 / 钱包字段定义：[QuantumNous/new-api](https://github.com/QuantumNous/new-api)

本项目与上述任何平台均无隶属或背书关系。各平台的接口、字段与条款可能随时变化，
本项目只做只读查询，不代管你的账号。
