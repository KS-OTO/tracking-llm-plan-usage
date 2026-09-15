# LLM 用量监控（tracking-llm-plan-usage）

开源网页工具：在一个页面集中查看 DeepSeek、火山方舟、智谱、阿里云、模力方舟、百度千帆、OpenRouter 及订阅套餐（Kimi / MiniMax / OpenCode Go）的余额与用量。
只需在环境变量中配置各家 API Key / Access Key，无需任何其他操作。

技术栈：Bun + Vue 3 + Vite（Vite+ 工具链：Oxfmt / Oxlint / tsgolint 严格类型检查 / Vitest / Rolldown 构建），
状态管理 Pinia，数据校验 Zod（前后端 JSON 边界统一 schema 校验）。
UI 组件库：TDesign Vue Next（桌面端；官方亮/暗主题 token；响应式 Grid 多列布局；适老化字号基线）。

## 功能

页面特性：

- **响应式多列布局**：桌面多列并排、平板两列、手机单列；平台按「套餐订阅 / 余额账户」Tab 分组，告别单列长下拉。
  布局只由 `src/assets/layout.css` 的语义化网格原语决定（组件不写断点），**同一行的卡片恒等宽等高**；
  卡内挂了 ≥2 个 Key 的区块会自动**独占整行**，让多个 Key 并排而不是被挤成「一行一个 + 换行」。
- **暗色模式**：一键切换并持久化（localStorage），默认跟随系统 `prefers-color-scheme`。
- **可访问性**：语义化地标（header/main/footer）、键盘可达、aria 标注、对比度对齐 TDesign 官方 token。
- **骨架屏 / 错误告警 / 空状态**：统一由 TDesign Skeleton / Alert / Empty 承载。
- **卡片只放高优先级读数**：卡片上只有窗口用量 / 余额 / 状态这类每天要看的数字；
  账号身份、订阅元数据、明细表、次级指标全部收进卡片右上角的「详情」弹窗，需要时才展开。
- **账号别名**：多 Key 场景下 `*_LABEL` 给每个 Key 起人类可读的名字，卡片主标题显示别名、
  Key 掩码退居次要位置（详见「账号别名」）。

| 数据源                | 接口                                                                                                                                                                                            | 展示内容                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek              | `GET /user/balance`                                                                                                                                                                             | 总余额、充值余额、赠金余额（CNY/USD）、可用状态                                                                                                     |
| 火山方舟 Agent Plan   | `GetAFPUsage` + `GetUsageDetails` + `GetCodingPlanUsage` + `GetInferenceUsage`                                                                                                                 | 卡片上是 Agent Plan 的 5 小时/每日/每周/每月配额与进度、重置倒计时；套餐类型、Coding Plan 状态与窗口额度、模型调用明细、近 N 天推理用量（可按模型过滤）全部收进「详情」弹窗 |
| 智谱 GLM              | `GET /api/monitor/usage/quota/limit`（Coding Plan）+ 控制台 biz API（余额/资源包）                                                                                                              | Coding Plan 套餐等级与 5 小时/每周窗口额度、账户余额、Token 资源包明细                                                                              |
| 阿里云百炼            | `QueryResourcePackageInstances`（BSS）                                                                                                                                                          | Token 资源包实例：总量/剩余、有效期、状态、适用产品（需 BSS 只读权限）                                                                              |
| 阿里云百炼 Token Plan | ModelStudio OpenAPI（ROA）：`GetSubscriptionSeatDetails` / `ListSubscriptionSharedPackages`；个人版用量经控制台网关（`zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/*`，Cookie 或 AK/SK 均可） | TokenPlan 账户/组织信息、订阅座席与共享包的 CREDITS 额度周期、总额/剩余；**个人版** 5 小时/7 天窗口用量、订阅状态与剩余天数、加购包 Credits、重置卡 |
| 模力方舟（Gitee AI）  | `GET /tokens/packages/balance` + 内部接口（Cookie）                                                                                                                                             | 资源包总金额/已用/剩余、代金券余额与明细（需配置会话 Cookie）                                                                                       |
| 百度智能云千帆        | 平台功能 OpenAPI（/v2/charge + /v2/service，BCE AK/SK 签名）                                                                                                                                    | 量包（总量/已用/到期/状态）+ TPM 配额 + 近 7 天调用概览（Token/次数/服务数）                                                                        |
| OpenRouter            | `GET /api/v1/credits` + `GET /api/v1/key`                                                                                                                                                       | 剩余额度 / 限额剩余 / 今日用量（「余额账户」Tab）；充值总额、周月用量、密钥元数据在「详情」弹窗内                                                  |
| 扩展平台（余额，仅服务端） | StepFun / SiliconFlow / OpenRouter / Novita 余额（`/api/extras`）                                                                                                                              | **页面已无独立 Tab**：OpenRouter 由上一行单独出卡，其余三家仅保留服务端接口（需要时可直接对接 `/api/extras`）                                       |
| 订阅套餐（可选）      | Kimi For Coding（`/coding/v1/usages`）/ MiniMax（`coding_plan/remains`）/ **OpenCode Go**（`/zen/go/v1/usage`），统一走 `/api/plans`                                                            | 按窗口计的**订阅额度**，与火山/智谱/百炼并列在「套餐订阅」Tab；**一平台一张卡，卡片标题即平台名**，卡显示窗口进度条，账号身份与窗口明细在「详情」弹窗内 |

密钥只存在于服务端环境变量，前端页面不接触任何 Key（仅展示掩码）。

## 快速开始

```bash
bun install
cp .env.example .env      # 填入你的 Key
vp dev                    # 单命令启动：前端 + 内置 API（读取 .env）
```

打开 http://localhost:5173 查看仪表盘。

> 开发模式内置 API：`server/app.ts` 已挂载进 Vite dev server，`vp dev` 单进程即可，
> 无需另开后端。`bun run dev:all`（后端 + 前端分开跑）仍可用。

生产模式：

```bash
vp build                  # 构建前端到 dist/
bun run server            # Bun 服务：同一端口提供 API 与静态页面
```

打开 http://127.0.0.1:8787 查看仪表盘。

## 部署到 Cloudflare Workers

单命令部署（构建 + 上传一次完成）：

```bash
bun run deploy            # = vp build && wrangler deploy
```

- 静态资源：Workers Assets 托管 `dist/`（SPA 回退已配置）
- API：`worker/index.ts` 复用 `server/app.ts`（平台无关 + Web Crypto 签名）
- 密钥：`wrangler secret put DEEPSEEK_API_KEY` 等逐项配置；本地调试用 `.dev.vars`（参考 `.dev.vars.example`）
- 多账号变量同样按 `_N` 后缀命名（如 `DEEPSEEK_API_KEY_2`）

## 部署到 EdgeOne Makers

仓库已含 Makers 适配层，在控制台把函数目录指向 `cloud-functions/` 即可：

- `cloud-functions/api/[[default]].js` —— `/api/*` 全捕获，动态 `import('../../server/app.ts')`
  复用同一份 `createAppHandler`；依赖链加载失败时返回结构化 `FN_IMPORT_FAILED`（而不是裸崩成 5xx HTML）。
- `cloud-functions/api/diag.js` —— 零依赖自诊断，访问 `/api/diag` 可区分「函数系统故障」与「依赖链加载失败」，
  并列出运行时已知的环境变量名（Key/Secret 类只显示 `<set>`），用于确认线上变量是否注入成功。
- `edgeone.json` 配置云函数超时与区域（`maxDuration: 60`，广州 / 新加坡）。
- 环境变量在 Makers 控制台 EnvVars 配置，经 `context.env` 注入；同样支持 `_N` 多账号。

## 部署到其他平台（Vercel 等）

`server/app.ts` 是平台无关的（只依赖 Web Fetch API 与 Web Crypto，不使用 `node:crypto`），
只要有「单一 HTTP 入口 + 环境变量注入」的平台都可以承载，`api/` 下的适配层照着
`cloud-functions/api/[[default]].js` 改写即可。

平台面板配置环境变量时有两条硬约束，配置前请先读「Cookie 怎么填」：

- **值不能含空格/换行/制表符** —— 所以百炼 Cookie 只粘 ticket 的**值**，别粘整段 `Cookie` 头。
- **面板不做 `$` 变量展开** —— 直接粘原值，**不要**加 `\$`（那是本地 `.env` 才需要的写法）。

另外两点容易踩：

- **改完变量必须重新部署才生效**：Vercel / Workers 的部署产物在构建期固化配置，
  改面板上的值不会影响已经在跑的实例，要触发一次新部署（或在面板点 Redeploy）。
- **用 CLI 配置时别用 `echo`**：`echo` 会附带回车换行，正是面板拒绝的「换行符」。
  服务端会把值 `trim()` 掉，因此写入的换行不会损坏查询，但面板会直接拒绝这一笔。

  ```bash
  # ✅ printf 不带换行
  printf '%s' '<login_aliyunid_ticket 的值>' | vercel env add ALIYUN_TOKENPLAN_COOKIE production
  # ❌ echo 会写入尾部 \n
  echo '<值>' | vercel env add ALIYUN_TOKENPLAN_COOKIE production
  ```

  排查线上「会话已失效」时，报错会附带**当前配置值的长度**，与浏览器中复制的值比对：

  - **偏短** → 本地 `.env` 里的字面 `$` 未转义，被变量展开吃掉了字符；
  - **长度一致但仍失败** → 大概率是会话真过期，重新复制即可。

## 多账号支持

每个平台支持多组凭据：第 1 组使用基础变量名，第 N 组在变量名后加 `_N` 后缀（连续编号，遇到缺失即停）。
例如 DeepSeek 三个账号：`DEEPSEEK_API_KEY`、`DEEPSEEK_API_KEY_2`、`DEEPSEEK_API_KEY_3`。
成对凭据（AccessKey/SecretKey）同编号成组：`VOLC_ACCESS_KEY_ID_2` + `VOLC_SECRET_KEY_2`。
每个账号独立查询、独立容错，仪表盘按账号卡片展示。

### 账号别名（多 Key 团队建议配置）

Key 掩码（`sk-f61c****L3Qe`）对人而言没有可读性——同一平台挂 5 个 Key 时无法判断哪个是哪个。
给每个 Key 配一个别名，卡片主标题就显示别名，Key 掩码退居次要位置（仅作消歧）。

变量名规则：**在凭据变量名前缀后加 `_LABEL`**，第 N 组同样加 `_LABEL_N`，按**序号**与凭据配对。

```bash
# 5 个 OpenCode Go 订阅，按团队标注归属
OPENCODE_GO_API_KEY=sk-aaaa...
OPENCODE_GO_LABEL=前端团队专用订阅
OPENCODE_GO_API_KEY_2=sk-bbbb...
OPENCODE_GO_LABEL_2=后端团队专用 Key
OPENCODE_GO_API_KEY_3=sk-cccc...
OPENCODE_GO_LABEL_3=算法组（长上下文）
```

各平台对应的别名前缀：

| 平台                                    | 凭据变量                  | 别名变量                 |
| --------------------------------------- | ------------------------- | ------------------------ |
| DeepSeek                                | `DEEPSEEK_API_KEY`        | `DEEPSEEK_LABEL`         |
| 火山方舟                                | `VOLC_ACCESS_KEY_ID`      | `VOLC_LABEL`             |
| 智谱 GLM                                | `ZHIPU_API_KEY`           | `ZHIPU_LABEL`            |
| 阿里云（资源包 / Token Plan 组织·座席） | `ALIYUN_ACCESS_KEY_ID`    | `ALIYUN_LABEL`           |
| 阿里 Token Plan 个人版（仅 Cookie）     | `ALIYUN_TOKENPLAN_COOKIE` | `ALIYUN_TOKENPLAN_LABEL` |
| 模力方舟                                | `GITEE_AI_API_KEY`        | `GITEE_LABEL`            |
| 百度千帆                                | `BAIDU_ACCESS_KEY_ID`     | `BAIDU_LABEL`            |
| StepFun / SiliconFlow / Novita          | `STEPFUN_API_KEY` 等      | `STEPFUN_LABEL` 等       |
| OpenRouter                              | `OPENROUTER_API_KEY`      | `OPENROUTER_LABEL`       |
| Kimi For Coding / MiniMax               | `KIMI_API_KEY` 等         | `KIMI_LABEL` 等          |
| OpenCode Go                             | `OPENCODE_GO_API_KEY`     | `OPENCODE_GO_LABEL`      |

三条容易踩的规则：

- **按序号配对，不按值配对**。`*_LABEL_2` 对应的是第 2 组凭据；中间断号（有 `_1`、`_3` 没 `_2`）会让后续组全部读不到。
- **别用 `ALIYUN_LABEL` 标 Cookie 专属账号**：没有 AK/SK 时 `ALIYUN_LABEL` 找不到配对项，别名会被忽略——这种情况请用 `ALIYUN_TOKENPLAN_LABEL`。
- **同一序号两种凭据并存时（AK/SK + Cookie）**，别名取 `ALIYUN_LABEL`（两者本就是同一账号，只出一张卡）。

别名只影响展示，不参与任何鉴权或查询。

## 环境变量

| 变量                      | 必填 | 说明                                                                                                       |
| ------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`        | 否   | DeepSeek API Key（余额查询），在 https://platform.deepseek.com/api_keys 获取                               |
| `VOLC_ACCESS_KEY_ID`      | 否   | 火山方舟 Access Key ID（管控面 API 签名）                                                                  |
| `VOLC_SECRET_KEY`         | 否   | 火山方舟 Secret Access Key                                                                                 |
| `ZHIPU_API_KEY`           | 否   | 智谱开放平台 API Key（资源包/余额），在 https://open.bigmodel.cn/usercenter/apikeys 获取                   |
| `ALIYUN_ACCESS_KEY_ID`    | 否   | 阿里云 AccessKey ID（BSS 资源包 + Token Plan 组织/座席），在 https://ram.console.aliyun.com/manage/ak 创建 |
| `ALIYUN_SECRET_KEY`       | 否   | 阿里云 AccessKey Secret                                                                                    |
| `ALIYUN_TOKENPLAN_COOKIE` | 否   | 百炼控制台 Cookie 中 `login_aliyunid_ticket` 的**值**（Token Plan 个人版用量，无需授权；详见下文取值注意） |
| `GITEE_AI_API_KEY`        | 否   | 模力方舟（Gitee AI）访问令牌（资源包余额），在 https://ai.gitee.com 生成                                   |
| `GITEE_AI_SESSION_COOKIE` | 否   | 模力方舟 Web 会话 Cookie（代金券查询，约 30 天过期需轮换；多账号 `_N` 后缀与 Key 配对）                    |
| `STEPFUN_API_KEY`         | 否   | StepFun 账户余额（仅 `/api/extras`，页面无独立 Tab），在 https://platform.stepfun.com 获取                |
| `SILICONFLOW_API_KEY`     | 否   | SiliconFlow 账户余额（仅 `/api/extras`，页面无独立 Tab），在 https://cloud.siliconflow.cn 获取            |
| `OPENROUTER_API_KEY`      | 否   | OpenRouter 剩余额度与限额，在 https://openrouter.ai/keys 获取                                              |
| `NOVITA_API_KEY`          | 否   | Novita AI 账户余额（仅 `/api/extras`，页面无独立 Tab），在 https://novita.ai 获取                         |
| `KIMI_API_KEY`            | 否   | Kimi For Coding Token Plan 额度，在 https://platform.moonshot.cn 获取                                      |
| `MINIMAX_API_KEY`         | 否   | MiniMax Token Plan 额度，在 https://platform.minimaxi.com 获取                                             |
| `OPENCODE_GO_API_KEY`     | 否   | OpenCode Go 订阅额度（5 小时/7 天/30 天窗口），在 https://opencode.ai 获取                                 |
| `HOST`                    | 否   | 监听地址，默认 `127.0.0.1`                                                                                 |
| `PORT`                    | 否   | 监听端口，默认 `8787`                                                                                      |

火山方舟 Access Key 在 https://console.volcengine.com/iam/keymanage 创建；出于安全考虑建议使用 IAM 子用户并仅授予方舟相关权限。
阿里云 AccessKey 建议使用 RAM 子用户：Token Plan 组织/座席区块需要 `AliyunTokenPlanReadOnlyAccess` 策略；资源包区块需要费用中心（bss:QueryResourcePackageInstances）只读权限，可按需分别授权。个人版用量用会话 Cookie 即可，无需任何授权。
各平台变量都配置齐全后才会启用对应页面。每个凭据变量都支持同序号的 `*_LABEL` / `*_LABEL_N` 别名（详见「账号别名」）。

OpenCode Go 的用量接口在 200 响应中为每个窗口附带 `status`（`ok` / `rate-limited`）。当某窗口被上游限流时，接口报 `percent: 100` 且 `status: "rate-limited"`——两者语义不同，因此面板会把该状态单独标为「上游限流中」并附说明，而不是只显示 100%。

> **取值规则因环境而异**：平台面板（Vercel / EdgeOne Makers / Cloudflare Workers）**原样保存**变量值、不做变量展开；
> 本地 `.env` / `.dev.vars` 会展开 `$`。含 `$` 的值（如百炼 ticket）在本地必须转义——详见「Cookie 怎么填」。

### 阿里云百炼 Token Plan 的权限说明

- **组织/座席视图**（团队版）走 ModelStudio OpenAPI（ROA + AK/SK），只需 `AliyunTokenPlanReadOnlyAccess`。
- **个人版用量**（5 小时/7 天窗口、订阅状态、加购包、重置卡）官方**未提供 AK/SK 直调的公开接口**：
  实测 `GET https://dashscope.aliyuncs.com/api/v1/tokenplan/*`（Bearer API Key）系列当前
  在网关返回空体 404（路由未注册，非鉴权失败）。项目提供两条等价通道，**Cookie 优先**：

  1. **控制台会话 Cookie（推荐，开箱可用）** —— 与百炼控制台页面自身的请求完全一致：
     `POST https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=…`
     ，Cookie 鉴权。登录 https://bailian.console.aliyun.com 后，从
     DevTools → Application → Cookies → `bailian.console.aliyun.com`，
     复制 **`login_aliyunid_ticket`** 的值写入 `ALIYUN_TOKENPLAN_COOKIE`
     （实测仅此一个 Cookie 即可；其余 Cookie、Origin/Referer 均非必需）。
     **无需 AK/SK，无需任何 RAM 授权**；会话过期（通常数周）后重新复制即可。
     仅有该 Cookie 时也可独立使用——此账号会显示「仅配置会话 Cookie」，组织/座席区块自动隐藏。
     **取值写法见下文「Cookie 怎么填」——填错会静默损坏且报错与「会话过期」同形。**

  2. **AK/SK 通道**（官方 CLI `bl usage token-plan` 的等价实现，原生移植、无子进程）：
     AK/SK 以 `ACS3-HMAC-SHA256` 调用 `GenerateCLIAccessToken` 换取控制台 access token，
     再经控制台网关调用 `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/*`。
     此路径需要 RAM 子用户额外授予以下自定义策略：

  ```json
  {
    "Version": "1",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "modelstudio:GenerateCLIAccessToken",
        "Resource": "*"
      }
    ]
  }
  ```

  未配置 Cookie 且未授权时，页面会在「个人版套餐用量」处给出黄色提示，组织/座席视图不受影响。

### 阿里云两块凭据是共存关系，不是二选一

`ALIYUN_ACCESS_KEY_ID` / `ALIYUN_SECRET_KEY` 与 `ALIYUN_TOKENPLAN_COOKIE` **各管一块数据，互不替代**：

| 展示内容                                              | 依赖的凭据                                                             | 缺失后果                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 阿里云百炼 Token 资源包实例（`/api/aliyun/packages`） | `ALIYUN_ACCESS_KEY_ID` + `ALIYUN_SECRET_KEY`（BSS）                    | 该接口返回 `NOT_CONFIGURED`，「资源包」区块不显示 |
| Token Plan 组织 / 座席 / 共享包                       | 同上（ModelStudio ROA）                                                | 组织/座席区块隐藏                                 |
| Token Plan **个人版**用量                             | `ALIYUN_TOKENPLAN_COOKIE`（**或** AK/SK + 额外 RAM 授权，Cookie 优先） | 「个人版套餐用量」处显示黄色提示                  |

结论：

- **加 Cookie 不会取代 AK/SK**，两者负责不同数据；相同序号视为同一账号，只出一张卡片。
- **不要把 AK/SK 删掉**：删了就同时丢掉「Token 资源包」和「组织/座席」两块。
- **只配 Cookie 也能用**：个人版用量可独立查询，组织/座席区块自动隐藏。
- 多账号按序号一一配对：`ALIYUN_ACCESS_KEY_ID_2` 与 `ALIYUN_TOKENPLAN_COOKIE_2` 指同一账号。

### Cookie 怎么填：只粘 ticket 的值，别粘整段

变量接受两种写法（裸 ticket 值，或整段 `Cookie` 头 `a=b; c=d`），但两者在不同环境下命运不同：

| 环境                                   | 整段 `Cookie` 头  | 原因                                                                   |
| -------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| Vercel / EdgeOne Makers / Workers 面板 | ❌ 会被拒绝       | 值里含 `; ` 空格，面板报「变量值不能包含空格、换行、制表符等特殊字符」 |
| 本地 `.env` / `.dev.vars`              | ✅ 可以，但需转义 | 加载器会展开 `$`，见下                                                 |

**推荐一律只粘 `login_aliyunid_ticket` 的值本身**——它不含空格与换行，所有平台都能原样保存，
服务端会自动按 `login_aliyunid_ticket=<值>` 处理（裸值缺少 `name=` 时自动补前缀）。

#### 本地 `.env`：字面 `$` 必须写成 `\$`，否则静默损坏

Bun 的 `.env` 加载器与 Vite 的 `loadEnv()`（`vite.config.ts` 用的就是它）**都会做 `$VAR` 变量展开**。
该 ticket 的值里含 `$`（形如 `…M_1t$w3j6$SFnA3gvT*…`），未转义时这两段会被当作变量名、
**静默展开为空**——实测 153 字符的 ticket 只剩 130 字符，丢了 23 个字符，且没有任何警告。

```bash
# ❌ 错误：$w3j6 与 $SFnA3gvHMS14Yv8bT 被当作变量展开为空
ALIYUN_TOKENPLAN_COOKIE=…M_1t$w3j6$SFnA3gvHMS14Yv8bT*…

# ✅ 正确：每个字面 $ 前加反斜杠
ALIYUN_TOKENPLAN_COOKIE=…M_1t\$w3j6\$SFnA3gvHMS14Yv8bT*…
```

损坏后的值发到网关只会返回 `BailianGateway.Login.NotLogined`——**与「会话过期」的报错完全一致**，
极易误判成 Cookie 失效。注意：**加引号（`"…"` / `'…'`）在两种加载器下都无效，必须用 `\$`**。

平台上（Vercel / EdgeOne / Workers 面板）**直接粘原值，不要加反斜杠**——那里不做变量展开。

自检（在项目根目录执行，`bun -e` 会自动加载 `.env`）：

```bash
bun -e 'console.log(process.env.ALIYUN_TOKENPLAN_COOKIE?.length ?? "not set")'
```

输出的长度应与你在浏览器里复制的值一致；**明显变短就说明 `$` 被展开吃掉了**。

## 常用命令

```bash
vp check            # 格式 + lint + 类型检查（Oxfmt/Oxlint/tsgolint，0 error / 0 warning）
vp test             # Vitest 单元测试（签名向量/多账号读取/各平台 zod 解析/组件契约）
bun run test:e2e    # Playwright E2E 冒烟（空态/响应式/暗色/回到顶部，自动拉起 vp dev）
vp build            # 生产构建（含 vue-tsc 严格类型检查）
```

## 目录结构

```
server/           平台无关 API 核心 + Bun 入口
  app.ts          createAppHandler(env)：全部 /api/* 路由（Bun/Worker/Vite 共用）
  index.ts        Bun 入口：Bun.serve + dist/ 静态服务
  multi.ts        多账号凭据读取（PREFIX / PREFIX_2 / ...）
  sign.ts         火山引擎 v4 签名（Web Crypto）
  volc.ts         方舟管控面 API 客户端（GetAFPUsage / GetCodingPlanUsage / GetUsageDetails / GetInferenceUsage）
  deepseek.ts     DeepSeek 余额客户端
  zhipu.ts        智谱客户端（Coding Plan 额度 / 账户余额 / 资源包）
  gitee.ts        模力方舟（Gitee AI）资源包余额客户端
  aliyun.ts       阿里云 RPC/ROA 签名 + BSS 资源包客户端
  aliyun-console.ts 百炼控制台网关（Token Plan 个人版用量：会话 Cookie / AK-SK 双通道 + ACS3 签名）
  tokenplan.ts    阿里云 Model Studio Token Plan 客户端（组织/座席/共享包）
  opencode.ts     OpenCode Go 订阅额度客户端（rolling/weekly/monthly + 窗口 status）
  balances.ts     StepFun / SiliconFlow / OpenRouter / Novita 余额客户端
  plans.ts        Kimi / MiniMax Token Plan 客户端
src/              Vue 3 前端（TDesign Vue Next + Pinia + Zod）
  api.ts          前端 API 客户端（错误信封 zod 校验）
  stores/         Pinia stores（dashboard 数据编排 / theme 暗色主题）
  types.ts        共享类型（多账号 AccountEnvelope 判别联合）
  utils.ts        展示格式化工具
  components/     各平台区块组件（AccountSection 统一外壳 + DetailDialog 详情弹窗）
                  套餐订阅 Tab：PlansSection 一平台一卡（Kimi / MiniMax / OpenCode Go）
  assets/layout.css 全站唯一布局层（语义化网格原语 + 断点；组件不写断点、不重复定义）
e2e/              Playwright E2E 冒烟
worker/           Cloudflare Workers 入口（复用 server/app.ts）
cloud-functions/  EdgeOne Makers 云函数（/api/* 全捕获 + /api/diag 自诊断）
docs/reviews/     七角色红蓝对抗审查报告
docs/             调研文档（阿里云 Token Plan / CC-Switch 用量查询全景）
```

## 参考文档

- DeepSeek 查询余额：https://api-docs.deepseek.com/zh-cn/api/get-user-balance/
- 火山方舟 Base URL 及鉴权：https://console.volcengine.com/ark/region:cn-beijing/docs/82379/1298459?lang=zh
- GetAFPUsage：https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2479847?lang=zh
- GetUsageDetails：https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2479849?lang=zh
- GetInferenceUsage：https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2116766?lang=zh
- 火山引擎签名方法：https://www.volcengine.com/docs/6369/67269
- 百炼 CLI（官方，Token Plan 用量实现来源）：https://github.com/modelstudioai/cli
- 百炼控制台 Token Plan 个人版页面（Cookie 通道的请求来源）：https://bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal
- 百炼 CLI 用量与配额文档：https://docs.bailian.console.aliyun.com/zh/model-studio/cli/usage-quota
- 百炼 Token Plan 系列 OpenAPI（当前网关未开放，实测 404）：https://docs.bailian.console.aliyun.com/zh/model-studio/get-subscription-stats
- OpenCode Go 用量参考实现（cc-switch PR #6547）：https://github.com/farion1231/cc-switch/pull/6547
- OpenCode Go 用量端点与字段语义（`GET /zen/go/v1/usage`，窗口 `status`/`percent`/`resetsAt`）：https://github.com/looplj/axonhub/pull/2204
