# 模力方舟（Gitee AI）代金券数据获取调研

## 结论

**代金券（cash coupon / voucher）余额与明细，没有任何「公开 Token 鉴权」的接口可获取。**
仅能通过 Web 控制台的 **Cookie 会话**访问一组未公开的内部端点。我们项目当前使用的「个人访问令牌」（`Authorization: Bearer <GITEE_AI_API_KEY>`）对这些端点一律返回 401。

## 证据（实测，2026-08-14）

### 公开 OpenAPI（Bearer Token 可用）

规范：https://ai.gitee.com/v1/yaml ，鉴权方案统一为 `AccessTokenAuth`（Bearer）。
与「钱」相关的公开端点只有一个：

| 端点                              | 鉴权          | 内容                               |
| --------------------------------- | ------------- | ---------------------------------- |
| `GET /v1/tokens/packages/balance` | Bearer ✅ 200 | 资源包总额/已用/剩余（项目已接入） |

公开规范全路径扫描：无 `wallet` / `coupons` / `voucher` / `account` 余额类端点；`/v1/app/user` 是「AI 应用市场订阅」专用，需「用户访问令牌」（OAuth 流程），且返回 `null`，与代金券无关。

### 内部端点（仅 Cookie 会话，参考资料 `docs/参考资料.md` 抓自控制台）

这些端点都不在公开 OpenAPI 中，参考资料里全部带 `"credentials": "include"`（浏览器登录 Cookie）：

| 端点                                                        | 含义                                                                          | Bearer 实测      | 无 auth 实测 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- | ------------ |
| `GET /api/base/userinfo`                                    | 账号信息（含 `namespace_path`）                                               | 401              | 401          |
| `GET /api/pay/{namespace}/wallet`                           | 钱包：`coupon_cash_balance` / `coupon_compute_balance` / `expiring_coupons[]` | 401              | 401          |
| `GET /api/pay/{namespace}/coupons?type=cash`                | 代金券列表：`amount` / `balance` / `expired_at` / `status`                    | 401              | 401          |
| `GET /api/pay/{namespace}/consumption/detail`               | 消费明细：含 `cash_coupon_amount`（代金券抵扣额）                             | （同上，Cookie） | —            |
| `GET /api/base/{namespace}/inference-log/operation-summary` | 模型用量汇总                                                                  | （同上，Cookie） | —            |

> `{namespace}` 是账号命名空间（如参考资料中的 `git18bit`），需先调 `/api/base/userinfo` 拿到 `namespace_path` —— 而 userinfo 本身也要 Cookie。即「拿 namespace」与「拿代金券」同属 Cookie 鉴权域，无法用 Token 串联。

### 鉴权模型差异

- **公开 OpenAPI**：长期有效的「个人访问令牌」（用户在 https://ai.gitee.com 生成，形如 `UC03...`），适合服务端常驻。
- **内部 `/api/*`**：浏览器登录后的会话 Cookie（短时，需用户名密码或 OAuth 登录获得），Token 不被接受。

## 折中方案对比

### 方案 A（推荐）：不抓代金券，控制台链接 + 说明

在 Gitee 区块底部加一行说明 + 跳转控制台钱包页（`https://ai.gitee.com`，登录后可见代金券）。

- ✅ 零安全风险、零维护成本、不依赖未公开接口
- ✅ 与项目「服务端长期 Token」模型一致
- ❌ 代金券余额不在仪表盘内展示

### 方案 B：会话 Cookie 抓取（不推荐，仅作可选实验）

用户额外提供 Gitee 登录会话 Cookie（而非/除了 API Token），服务端用 Cookie 调 `/api/base/userinfo` → `/api/pay/{ns}/wallet` + `/api/pay/{ns}/coupons`。

- ✅ 能在仪表盘展示代金券余额/明细/即将过期
- ❌ Cookie 短时过期（数小时~数天），需反复重新提供，无自动刷新
- ❌ 存储 Cookie ≈ 等同存储登录态，安全敏感；开源工具不应鼓励
- ❌ 依赖未公开内部接口，Gitee 改版即坏
- ❌ 可能触发风控/限流，潜在违反使用条款

### 方案 C：向 Gitee 提功能请求（长期正解）

请 Gitee AI 在公开 OpenAPI 暴露 `GET /v1/wallet` 或 `GET /v1/coupons`（数据后端已有 `coupon_cash_balance` 等字段，仅缺公开出口）。这是根治路径。

### 方案 D：OAuth「用户访问令牌」流（待验证）

公开规范提到 `/v1/app/user` 需「用户访问令牌（通过获取用户访问凭证接口获取）」，疑似 OAuth 授权码流程。但该流程面向「AI 应用市场订阅」，**极大概率不含代金券**，且需实现完整 OAuth（回调页、token 交换、刷新）。投入产出比低，未实测。

## 建议

**采方案 A**（立即、安全），**并行方案 C**（向 Gitee 提需求）。仅在用户明确接受方案 B 全部代价时，才作为「实验性、opt-in、显著告警」特性实现。
