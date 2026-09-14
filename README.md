# LLM 用量监控（tracking-llm-plan-usage）

开源网页工具：在一个页面集中查看 DeepSeek、火山方舟、智谱、阿里云、模力方舟及扩展平台的余额与套餐用量。
只需在环境变量中配置各家 API Key / Access Key，无需任何其他操作。

技术栈：Bun + Vue 3 + Vite（Vite+ 工具链：Oxfmt / Oxlint / tsgolint 严格类型检查 / Vitest / Rolldown 构建），
状态管理 Pinia，数据校验 Zod（前后端 JSON 边界统一 schema 校验）。
UI 组件库：TDesign Vue Next（桌面端；官方亮/暗主题 token；响应式 Grid 多列布局；适老化字号基线）。

## 功能

页面特性：

- **响应式多列布局**：桌面（≥992px）双列并排、平板单/双列自适应、手机单列；平台按「套餐订阅 / 余额账户 / 扩展平台」Tab 分组，告别单列长下拉。
- **暗色模式**：一键切换并持久化（localStorage），默认跟随系统 `prefers-color-scheme`。
- **可访问性**：语义化地标（header/main/footer）、键盘可达、aria 标注、对比度对齐 TDesign 官方 token。
- **骨架屏 / 错误告警 / 空状态**：统一由 TDesign Skeleton / Alert / Empty 承载。

| 数据源                | 接口                                                                                                                                                                                            | 展示内容                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek              | `GET /user/balance`                                                                                                                                                                             | 总余额、充值余额、赠金余额（CNY/USD）、可用状态                                                                                                     |
| 火山方舟 Agent Plan   | `GetAFPUsage` + `GetUsageDetails`                                                                                                                                                               | 套餐类型 + 5 小时/每日/每周/每月 AFP 配额与用量、重置倒计时、模型调用明细                                                                           |
| 火山方舟 Coding Plan  | `GetCodingPlanUsage`（套餐额度）+ `GetInferenceUsage`（推理用量）                                                                                                                               | Coding Plan 状态/窗口额度（session/周/月）+ 近 N 天推理用量、按模型过滤                                                                             |
| 智谱 GLM              | `GET /api/monitor/usage/quota/limit`（Coding Plan）+ 控制台 biz API（余额/资源包）                                                                                                              | Coding Plan 套餐等级与 5 小时/每周窗口额度、账户余额、Token 资源包明细                                                                              |
| 阿里云百炼            | `QueryResourcePackageInstances`（BSS）                                                                                                                                                          | Token 资源包实例：总量/剩余、有效期、状态、适用产品（需 BSS 只读权限）                                                                              |
| 阿里云百炼 Token Plan | ModelStudio OpenAPI（ROA）：`GetSubscriptionSeatDetails` / `ListSubscriptionSharedPackages`；个人版用量经控制台网关（`zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/*`，Cookie 或 AK/SK 均可） | TokenPlan 账户/组织信息、订阅座席与共享包的 CREDITS 额度周期、总额/剩余；**个人版** 5 小时/7 天窗口用量、订阅状态与剩余天数、加购包 Credits、重置卡 |
| 模力方舟（Gitee AI）  | `GET /tokens/packages/balance` + 内部接口（Cookie）                                                                                                                                             | 资源包总金额/已用/剩余、代金券余额与明细（需配置会话 Cookie）                                                                                       |
| 百度智能云千帆        | 平台功能 OpenAPI（/v2/charge + /v2/service，BCE AK/SK 签名）                                                                                                                                    | 量包（总量/已用/到期/状态）+ TPM 配额 + 近 7 天调用概览（Token/次数/服务数）                                                                        |
| 扩展平台（可选）      | StepFun / SiliconFlow / OpenRouter / Novita 余额 + Kimi / MiniMax / **OpenCode Go** Token Plan                                                                                                  | 配置对应密钥后自动出现在「其他平台（扩展）」区块，支持多账号                                                                                        |

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

## 多账号支持

每个平台支持多组凭据：第 1 组使用基础变量名，第 N 组在变量名后加 `_N` 后缀（连续编号，遇到缺失即停）。
例如 DeepSeek 三个账号：`DEEPSEEK_API_KEY`、`DEEPSEEK_API_KEY_2`、`DEEPSEEK_API_KEY_3`。
成对凭据（AccessKey/SecretKey）同编号成组：`VOLC_ACCESS_KEY_ID_2` + `VOLC_SECRET_KEY_2`。
每个账号独立查询、独立容错，仪表盘按账号卡片展示。

## 环境变量

| 变量                      | 必填 | 说明                                                                                      |
| ------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`        | 否   | DeepSeek API Key（余额查询），在 https://platform.deepseek.com/api_keys 获取              |
| `VOLC_ACCESS_KEY_ID`      | 否   | 火山方舟 Access Key ID（管控面 API 签名）                                                 |
| `VOLC_SECRET_KEY`         | 否   | 火山方舟 Secret Access Key                                                                |
| `ZHIPU_API_KEY`           | 否   | 智谱开放平台 API Key（资源包/余额），在 https://open.bigmodel.cn/usercenter/apikeys 获取  |
| `ALIYUN_ACCESS_KEY_ID`    | 否   | 阿里云 AccessKey ID（BSS 资源包查询），在 https://ram.console.aliyun.com/manage/ak 创建   |
| `ALIYUN_SECRET_KEY`       | 否   | 阿里云 AccessKey Secret                                                                   |
| `ALIYUN_TOKENPLAN_COOKIE` | 否   | 百炼控制台会话 Cookie（仅 Token Plan 个人版用量，只需 `login_aliyunid_ticket`，无需授权） |
| `GITEE_AI_API_KEY`        | 否   | 模力方舟（Gitee AI）访问令牌（资源包余额），在 https://ai.gitee.com 生成                  |
| `GITEE_AI_SESSION_COOKIE` | 否   | 模力方舟 Web 会话 Cookie（代金券查询，约 30 天过期需轮换；多账号 `_N` 后缀与 Key 配对）   |
| `STEPFUN_API_KEY`         | 否   | StepFun 账户余额，在 https://platform.stepfun.com 获取                                    |
| `SILICONFLOW_API_KEY`     | 否   | SiliconFlow 账户余额，在 https://cloud.siliconflow.cn 获取                                |
| `OPENROUTER_API_KEY`      | 否   | OpenRouter 剩余额度，在 https://openrouter.ai/keys 获取                                   |
| `NOVITA_API_KEY`          | 否   | Novita AI 账户余额，在 https://novita.ai 获取                                             |
| `KIMI_API_KEY`            | 否   | Kimi For Coding Token Plan 额度，在 https://platform.moonshot.cn 获取                     |
| `MINIMAX_API_KEY`         | 否   | MiniMax Token Plan 额度，在 https://platform.minimaxi.com 获取                            |
| `OPENCODE_GO_API_KEY`     | 否   | OpenCode Go 订阅额度（5 小时/7 天/30 天窗口），在 https://opencode.ai 获取                |
| `HOST`                    | 否   | 监听地址，默认 `127.0.0.1`                                                                |
| `PORT`                    | 否   | 监听端口，默认 `8787`                                                                     |

火山方舟 Access Key 在 https://console.volcengine.com/iam/keymanage 创建；出于安全考虑建议使用 IAM 子用户并仅授予方舟相关权限。
阿里云 AccessKey 建议使用 RAM 子用户：Token Plan 区块需要 `AliyunTokenPlanReadOnlyAccess` 策略；资源包区块需要费用中心（bss:QueryResourcePackageInstances）只读权限，可按需分别授权。
各平台变量都配置齐全后才会启用对应页面。

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
     （实测仅此一个 Cookie 即可；其余 Cookie、Origin/Referer 均非必需。
     该变量两种写法都接受：裸 ticket 值，或整段 `Cookie` 请求头 `a=b; c=d`）。
     **无需 AK/SK，无需任何 RAM 授权**；会话过期（通常数周）后重新复制即可。
     仅有该 Cookie 时也可独立使用——此账号会显示「仅配置会话 Cookie」，组织/座席区块自动隐藏。

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
  opencode.ts     OpenCode Go 订阅额度客户端（rolling/weekly/monthly）
  balances.ts     StepFun / SiliconFlow / OpenRouter / Novita 余额客户端
  plans.ts        Kimi / MiniMax Token Plan 客户端
src/              Vue 3 前端（TDesign Vue Next + Pinia + Zod）
  api.ts          前端 API 客户端（错误信封 zod 校验）
  stores/         Pinia stores（dashboard 数据编排 / theme 暗色主题）
  types.ts        共享类型（多账号 AccountEnvelope 判别联合）
  utils.ts        展示格式化工具
  components/     各平台区块组件（AccountSection 统一外壳）
e2e/              Playwright E2E 冒烟
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
- 百炼 CLI 用量与配额：https://docs.bailian.console.aliyun.com/zh/model-studio/cli/usage-quota
- OpenCode Go 用量接口（cc-switch PR #6547）：https://github.com/farion1231/cc-switch/pull/6547
