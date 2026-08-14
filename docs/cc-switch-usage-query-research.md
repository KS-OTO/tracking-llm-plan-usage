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
