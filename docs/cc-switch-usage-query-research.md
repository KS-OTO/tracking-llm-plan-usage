# CC-Switch 远端计费用量/余额查询调研（2026-08-05）

> 背景：通过 GitHub CLI 系统检索开源项目 [farion1231/cc-switch](https://github.com/farion1231/cc-switch) 中所有**远端计费平台**的用量/余额/消费查询实现（本地模型用量统计已排除）。
> 目的：找出可移植到本项目的余额/套餐额度查询接口，并验证火山 Coding Plan 专用接口。

## 一、能力全景（代码级确认）

### 1. 账户余额查询（`src-tauri/src/services/balance.rs`）

| 供应商              | 接口                                            | 响应字段                                         | 单位    |
| ------------------- | ----------------------------------------------- | ------------------------------------------------ | ------- |
| DeepSeek            | `GET api.deepseek.com/user/balance`（Bearer）   | `balance_infos[]`：currency/total_balance        | CNY/USD |
| StepFun             | `GET api.stepfun.com/v1/accounts`（Bearer）     | `balance`                                        | CNY     |
| SiliconFlow（国内） | `GET api.siliconflow.cn/v1/user/info`（Bearer） | `data.totalBalance`                              | CNY     |
| SiliconFlow（国际） | `GET api.siliconflow.com/v1/user/info`          | `data.totalBalance`                              | USD     |
| OpenRouter          | `GET openrouter.ai/api/v1/credits`（Bearer）    | `data.total_credits` / `data.total_usage`        | USD     |
| Novita AI           | `GET api.novita.ai/v3/user/balance`（Bearer）   | `availableBalance`（0.0001 USD 单位，需 ÷10000） | USD     |

### 2. Token Plan / Coding Plan 套餐额度（`src-tauri/src/services/coding_plan.rs`）

| 供应商                   | 接口                                                                                  | 鉴权                    | 窗口结构                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Kimi For Coding          | `GET api.kimi.com/coding/v1/usages`                                                   | Bearer                  | `limits[].detail{limit,remaining,resetTime}` = 5 小时；`usage{limit,remaining,resetTime}` = 每周                                       |
| Zhipu GLM                | `GET open.bigmodel.cn/api/monitor/usage/quota/limit`                                  | **裸 Key（无 Bearer）** | `data.limits[]`：`unit:3`=5小时、`unit:6`=每周；`percentage`+`nextResetTime`；`data.level`=套餐等级                                    |
| Zhipu Team               | 同路径 `?type=2` + `bigmodel-organization`/`bigmodel-project` 头                      | 裸 Key                  | 响应 shape 同个人版                                                                                                                    |
| MiniMax                  | `GET api.minimaxi.com/v1/api/openplatform/coding_plan/remains`（国际 api.minimax.io） | Bearer                  | `model_remains[]` 中 `model_name=="general"`：`current_interval_remaining_percent`+`end_time`（5h）；`current_weekly_status==1` 时周桶 |
| ZenMux                   | `GET {用户配置的 base_url}`                                                           | Bearer                  | `data.quota_5_hour.usage_percentage`                                                                                                   |
| 火山方舟 Agent Plan      | `GetAFPUsage`（控制面 OpenAPI）                                                       | AK/SK 签名 v4           | 5h/日/周/月 窗口（Quota/Used/ResetTime）                                                                                               |
| **火山方舟 Coding Plan** | **`GetCodingPlanUsage`**（控制面 OpenAPI，`open.volcengineapi.com`）                  | AK/SK 签名 v4           | `Result.QuotaUsage[]`：`Level`(session/weekly/monthly)+`Percent`+`ResetTime`(秒)；另有 `Result.Status`                                 |

### 3. 官方订阅（OAuth 会话型，读取本地 CLI 凭据，不可用 API Key）

| 供应商         | 接口                                                            | 说明                                          |
| -------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Claude         | `GET api.anthropic.com/api/oauth/usage`                         | OAuth token                                   |
| Codex          | `GET chatgpt.com/backend-api/wham/usage`                        | OAuth                                         |
| Gemini         | `POST cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` | OAuth + refresh token                         |
| Grok/SuperGrok | `grok.com` gRPC-web `GetGrokCreditsConfig`                      | OAuth，protobuf 启发式解析（移植自 CodexBar） |

### 4. 其他

- `usage_script.rs` / `services/provider/usage.rs`：JS 脚本执行器（`{{apiKey}}`/`{{baseUrl}}` 模板）
- 模板类型：CUSTOM / GENERAL / NEW_API / GITHUB_COPILOT / TOKEN_PLAN / BALANCE / OFFICIAL_SUBSCRIPTION
- 火山签名：`open.volcengineapi.com` 固定网关，canonical query 含 `Region` 参数（我们已对齐）

## 二、Issues / PRs 检索要点（gh search）

- **#6070 / #4921**：火山用量查询异常——Agent Plan 与 Coding Plan 需**分别查询**（GetAFPUsage + GetCodingPlanUsage）
- **#5150**：Codex 用量查询出现两个结果（OAuth 多会话）
- **#5396**：http 形式 baseUrl 无法用量统计（校验强制 https）
- **#4029**：zstd 压缩响应解析报错
- **#3036**：智谱每周/5小时窗口按时间排序会标反——必须按 `unit` 字段分类（我们已按此实现）
- PR 检索无额外实现

## 三、对本项目的落地

已实现（全部真实凭据实测）：

- ✅ 智谱 Coding Plan（`/api/monitor/usage/quota/limit`，裸 Key）—— pro 套餐 5h/周窗口
- ✅ 智谱账户余额 + 资源包（`bigmodel.cn/api/biz/*` 控制台 API，Bearer Key）
- ✅ 火山 Agent Plan（GetAFPUsage）+ **Coding Plan（GetCodingPlanUsage）**—— 实测状态 `Reclaimed`（订阅已回收）
- ✅ 火山 GetInferenceUsage（通用推理用量，文档链发现）

本轮新增（`server/balances.ts` + `server/plans.ts` + `/api/extras`）：

- ✅ StepFun / SiliconFlow / OpenRouter / Novita AI 余额查询
- ✅ Kimi For Coding / MiniMax Token Plan 额度查询
- 前端统一「其他平台（扩展）」区块

未实现（需 OAuth 会话或私有服务）：

- ❌ Claude / Codex / Gemini / Grok 官方订阅（OAuth 凭据，与本项目 API Key 模型不兼容）
- ❌ Zhipu Team（需要组织/项目 ID，暂未配置）
- ❌ ZenMux（私有中转服务）

## 四、2026-09-14 补充：OpenCode Go 订阅额度

来源：cc-switch PR [#6547](https://github.com/farion1231/cc-switch/pull/6547)
（`fix(opencode): render Go quota usage accurately`，Fixes #6350）。

- **接口**：`GET {{baseUrl}}/usage`；preset 的 provider `baseURL` 为 `https://opencode.ai/zen/go/v1`，
  故最终地址为 **`https://opencode.ai/zen/go/v1/usage`**（无重复 `/v1`）。
- **鉴权**：`Authorization: Bearer {{apiKey}}` —— **纯 API Key，无需控制台 Cookie**（区别于 #3606/#6434 的 cookie/SSR 方案）。
- **响应**：`usage.rolling` / `usage.weekly` / `usage.monthly`，每个窗口 `{ percent, resetsAt }`。
  - `percent` **直接是「已用百分比」**（不是剩余）。
  - `resetsAt` 为重置时间（ISO 字符串），用于倒计时；PR 展示为 `5h:0%4h59m 7d:19%6d3h 30d:5%21d7h`。
- **窗口映射**：rolling → 5 小时、weekly → 7 天、monthly → 30 天。

**本仓库实测**：`GET https://opencode.ai/zen/go/v1/usage` 无 Key 返回 **401**，
而任意不存在的同级路径返回 404 —— 路由真实存在。

落地：

- 新增 `server/opencode.ts`（`fetchOpenCodeGoUsage`）。
- 接入 `/api/extras` 的 `plans` 分组（与 Kimi / MiniMax Token Plan 同一区块），
  窗口类型扩展 `'fiveHour' | 'weekly' | 'monthly'`，前端新增「30 天窗口」标签。
- 环境变量 `OPENCODE_GO_API_KEY`（多账号 `_2`… 后缀，别名 `OPENCODE_GO_LABEL`）。

## 五、2026-10-20 对齐（cc-switch v4.0.16 源码复核）

复核基准：`farion1231/cc-switch@74cf8e6`（v4.0.16，2026-10-20）。

### 本轮补齐的供应商

| 类别        | 供应商       | 接口 / 字段口径                                                                                                                               | 我方实现                                                 |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 余额        | StepFun      | `GET api.stepfun.com/v1/accounts`；`balance` + `total_cash_balance` / `total_voucher_balance`                                                 | `server/balances.ts` → `stepfun` 切片                    |
| 余额        | SiliconFlow  | `GET api.siliconflow.{cn,com}/v1/user/info`；`data.totalBalance` + 充值 / 赠费；CN=CNY / 全球=USD                                             | `siliconflow` 切片（`SILICONFLOW_SITE=cn                 | global`） |
| 余额        | Novita AI    | `GET api.novita.ai/v3/user/balance`；金额单位 0.0001 USD，`availableBalance` ÷ 10000                                                          | `novita` 切片                                            |
| 余额 / 订阅 | Sub2API      | `GET {baseUrl}/v1/usage`（Bearer 模型 Key）；`remaining` / `quota.limit` / `quota.used` / `planName` / `unit`；`remaining=-1` 为不限量        | `server/sub2api.ts` → `subapi` 切片；不限量只显示套餐名  |
| 套餐        | Command Code | `/alpha/whoami` → 组织 ID；`/alpha/billing/credits`、`/alpha/billing/subscriptions`、`/alpha/usage/summary`；5h / 周滚动窗口 + 计费周期月度池 | `server/commandcode.ts`，`plans` 切片（USD 绝对额度）    |
| 套餐        | ZenMux       | `GET {ZENMUX_BASE_URL}`（默认 `https://zenmux.ai/api/v1`）；`quota_5_hour` / `quota_7_day` 的 `usage_percentage`(0–1) + USD 额度              | `server/zenmux.ts`，`plans` 切片                         |
| 套餐        | 智谱团队版   | 同个人版路径 + `?type=2` + `bigmodel-organization` / `bigmodel-project` 请求头                                                                | `ZHIPU_ORGANIZATION_ID` / `ZHIPU_PROJECT_ID` 按 Key 配对 |
| 状态        | 智谱未订阅   | 按量账户回 HTTP 200 + `code:500 "当前用户不存在coding plan"`，视为**中性状态**而非故障                                                        | 额度卡显示「未订阅（按量付费）」，余额卡照常             |

### 错误处理 / 字段语义对齐

- 所有新查询统一 15s 超时（与 CC-Switch 一致），鉴权失败给出明确中文文案
  （401 = Key 无效 / 403 = 未开通服务）。
- OpenCode Go：`percent=0` 时丢弃上游占位 `resetsAt`；缺失 `percent` 的窗口跳过；
  一个窗口都解析不出来时报错而不是渲染空卡；403 单独提示「Key 有效但未开通 Go 订阅」。
- Command Code / ZenMux 的窗口在百分比之外附带 `used` / `total` / `unit`，
  卡面显示「已用 $X / $Y」，详情表格新增「额度」列。
- Sub2API 不限量分组不再伪造 `0` 余额，改为只展示套餐名。

### 仍未实现（凭据模型不兼容）

- Claude / Codex / Gemini / Grok Build 官方订阅：读取本机 CLI 的 OAuth 凭据，
  本项目是纯服务端环境变量模型，无法复用。
- GitHub Copilot / xAI OAuth / Codex OAuth 反向代理：同上，需要 OAuth 会话。
- 智谱团队版的 `zhipu_team` 显式模板选择：我方在 `ZHIPU_ORGANIZATION_ID` /
  `ZHIPU_PROJECT_ID` 同时存在时自动切团队口径，无需额外枚举。
