# oh-my-pi 用量 / 额度 / 余额实现调研（2026-10-21）

> 竞品：[can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) `d5cd750`（v18.12.5，2026-10-21）。
> 目的：复核本项目阿里云百炼 Token Plan 的参考来源，并对齐其余可查询供应商的端点、字段与错误语义。

## 一、实现位置

| 模块               | 文件                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| 用量提供者注册表   | `packages/ai/src/usage/registry.ts`                                                                            |
| 阿里云 Token Plan  | `packages/ai/src/usage/alibaba-token-plan.ts`                                                                  |
| MiniMax Token Plan | `packages/ai/src/usage/minimax-code.ts`                                                                        |
| Command Code       | `packages/ai/src/usage/commandcode.ts`                                                                         |
| OpenCode Go        | `packages/ai/src/usage/opencode-go.ts`                                                                         |
| Z.AI / GLM         | `packages/ai/src/usage/zai.ts`                                                                                 |
| Kimi               | `packages/ai/src/usage/kimi.ts`                                                                                |
| OAuth / 本机凭据类 | `claude*.ts`、`openai-codex*.ts`、`gemini.ts`、`github-copilot.ts`、`xai-oauth.ts`、`cursor.ts`、`devin.ts` 等 |
| 其他 API Key 类    | `charm-hyper.ts`、`cline-pass.ts`、`factory-droid.ts`、`muse-code.ts`、`synthetic.ts`、`umans.ts`、`ollama.ts` |

它是 CLI 的 `omp usage` 子系统：统一 `UsageReport { limits, metadata }`，
每条 `UsageLimit` 带 `window`（id / durationMs / resetsAt）、`amount`（used / limit / remaining / usedFraction / unit）、`status`（ok / warning / exhausted）。

## 二、阿里云 Token Plan（本项目重点）

oh-my-pi 的实现与本项目原实现差异最大：

| 维度        | 本项目（对齐前）        | oh-my-pi                                                           |
| ----------- | ----------------------- | ------------------------------------------------------------------ |
| 区域        | 仅百炼北京站            | 国内 `bailian.console.aliyun.com` + 国际 `home.qwencloud.com`      |
| 会话 token  | 直接 POST 网关          | 先 GET 会话页取 `SEC_TOKEN`（CN HTML / INTL JSON `data.secToken`） |
| 网关 action | `BroadScopeAspnGateway` | CN `BroadScopeAspnGateway`；INTL `IntlBroadScopeAspnGateway`       |
| 请求体      | `params` + `region`     | 额外 `sec_token` + `product` + `action`                            |
| CSRF        | 无                      | `x-xsrf-token` / `x-csrf-token`（取自 Cookie）                     |
| 窗口        | 5h / 7d                 | 5h / 7d / **monthly**（`per1MonthPercentage`）                     |
| 百分比      | 一律 ×100               | `>1` 视为已是百分数，否则 ×100                                     |
| 账号 ID     | 无                      | 国际站会话 `accountId` / `userId` / `aliyunId` / `loginId`         |

本轮已对齐：

- `createCookieTransport(cookie, region)` 优先走 SEC_TOKEN 流程，旧直连网关保留为国内站兜底；
- 新增 `ALIYUN_TOKENPLAN_REGION=cn|intl`（默认 `cn`）；
- 解析 `per1MonthPercentage` / `per1MonthResetTime`，前端新增「月度窗口」；
- `toUsedPercent` 兼容 0–1 与 0–100 两种口径；
- 国际站账号 ID 进入详情弹窗；
- 网关 `successResponse === false` 也按错误处理。

**实测限制**：本机 `ALIYUN_TOKENPLAN_COOKIE` 已过期（会话页无 `SEC_TOKEN`），
无法完成真实国际站/月度窗口线上验证；请求形状与解析均有单测锁定。

## 三、MiniMax Token Plan

oh-my-pi 使用 **`GET /v1/token_plan/remains`**（Bearer API Key），本项目原来使用
`/v1/api/openplatform/coding_plan/remains`。无鉴权探测：

| 端点                                       | 无鉴权响应                                         |
| ------------------------------------------ | -------------------------------------------------- |
| `/v1/token_plan/remains`                   | `1004 login fail: Please carry the API secret key` |
| `/v1/api/openplatform/coding_plan/remains` | `1004 cookie is missing`                           |

说明新端点是 API-key 友好路径。已对齐：

- 新端点优先，仅 404/405/410 回落旧端点；
- 支持 `MINIMAX_SITE=cn|global`（缺省 cn，国际站 `api.minimax.io`）；
- 窗口状态：1 正常、2 已用尽（强制 100%）、3 不限量（跳过）；
- 「不限量 + 总量 0 + 剩余 100%」识别为套餐不包含该桶，明确报错而不是展示假额度。

## 四、Command Code

oh-my-pi 只查询：

1. `GET /alpha/whoami` → 用户 / 组织 ID；
2. `GET /alpha/billing/credits?orgId=…` → `credits` + `windowLimits`。

它**不依赖** `/alpha/billing/subscriptions` 与 `/alpha/usage/summary`，并把
`monthlyCredits + purchasedCredits + freeCredits` 报成独立的 **Credit balance**（单位 `credits`）。
本项目已调整：

- subscriptions / summary 变为 best-effort，失败仍返回窗口与余额；
- 新增 `TokenPlanInfo.balance`，前端卡面/详情展示 credit 余额；
- 窗口单位从 USD 修正为 `credits`（不再冒充货币）。

## 五、OpenCode Go

- oh-my-pi 额外发送 `User-Agent` 与 `x-opencode-session`（upstream 2026-09-06 起要求）；
  本项目已补上。
- oh-my-pi 要求三个窗口全部解析成功，否则视为临时失败；本项目仍采用逐窗口防御
  （缺失窗口跳过），避免上游一次变形就整卡不可用。
- 401/403 单独抛错，403 = Key 有效但无 Go 订阅；本项目已有同义中文文案。

## 六、Z.AI / GLM

- `CREDIT_LIMIT` 优先用 `currentValue / usage` 的精确比值，`percentage` 只作兜底；
  本项目已对齐（上游 `percentage` 是取整整数）。
- 支持 `unit` 3=小时、4=天、5=月、6=周，并用 `number` 计算窗口名；
  本项目目前只映射 3/6，`TIME_LIMIT`、unit 4/5 仍缺（GLM Coding Plan 主路径为 3/6）。
- 还会额外拉 `/api/monitor/usage/model-usage` 作为 metadata；本项目未做（非额度必需）。

## 七、其余供应商

- **Kimi**：oh-my-pi 只支持 OAuth（`kimi-code`），本项目保留 API Key 的
  `api.kimi.com/coding/v1/usages`，两者不冲突。
- **Claude / Codex / Gemini / Copilot / xAI / Cursor / Devin / Antigravity**：依赖 OAuth
  或本机会话/浏览器 cookie，与本项目“服务端 API Key”模型不兼容。
- **Charm Hyper**：`GET {base}/v1/credits → { balance }`，纯 API Key 余额类；
  本项目尚未接入（竞品以 credit balance 形式展示）。
- **Cline Pass / Factory Droid / Muse Code / Synthetic / Umans / Ollama**：各有独立
  私有 API，部分需要 OAuth/账号会话；未纳入本轮。

## 八、结论

本轮已把与现有供应商直接相关的差异全部对齐：阿里云（SEC_TOKEN / 国际站 / 月度窗口）、
MiniMax（新端点 / 状态语义）、Command Code（credits 余额 / 可选 summary）、OpenCode Go
（会话头）、Z.AI（精确百分比）。剩余差距集中在 OAuth 类供应商与本项目未接入的
Charm Hyper 等余额平台，已在第七节列明。
