# 阿里云百炼 Token Plan 用量查询调研（2026-08-05）

> 背景：用户为主账号，购买了百炼 **Token Plan 个人版**。目标是找到通过 API 查询套餐余额/用量的方法。
> 结论先行：**个人版用量目前不存在 AK/SK 可调的公开 API**，官方 CLI 也是靠浏览器控制台会话实现；管控面 OpenAPI 只有组织/座席/共享包维度（个人版为空属正常）。

## 一、管控面 OpenAPI（AK/SK 可调，已实现并验证）

产品：**Model Studio**（OpenAPI 门户产品名 `ModelStudio`，版本 `2026-02-10`）
端点：`modelstudio.cn-beijing.aliyuncs.com`（其它地域见产品元数据）
风格：**ROA**（非 RPC）——`Date` 头 + 仅 `x-acs-*` 规范化头 + `Authorization: acs <AK>:<签名>`，HMAC-SHA1 密钥为裸 SK。
签名实现已与真实网关逐项对齐验证（服务器回显 string-to-sign 对比迭代后 200）。

RAM 授权：内置策略 **`AliyunTokenPlanReadOnlyAccess`**（用户已配置）。

| API                            | 路径                                        | 说明                                                            | 实测结果                               |
| ------------------------------ | ------------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| GetTokenPlanAccountDetail      | GET /tokenplan/account                      | 账号/组织信息                                                   | ✅ 返回默认组织、ORG_OWNER、workspace  |
| GetOrganization                | GET /tokenplan/organization?OrgId=          | 组织详情                                                        | ✅ 默认组织（NamespaceId=namespace-1） |
| ListOrganizationMembers        | GET /tokenplan/organization/members         | 成员列表                                                        | ✅ 1 个成员（owner）                   |
| GetSubscriptionSeatDetails     | GET /tokenplan/subscription/seat-detail     | 订阅座席明细（含 EquityList CREDITS 额度周期）                  | ✅ Total: 0（任何参数组合）            |
| ListSubscriptionSharedPackages | GET /tokenplan/subscription/shared-packages | 共享包明细                                                      | ✅ Total: 0                            |
| GetSubscriptionStats           | GET /tokenplan/subscription/stats           | 席位/额度统计（AssignedSeats/SeatCredits/SeatRemainingCredits） | ✅ 无 Data（无订阅）                   |
| CreateTokenPlanKey 等          | POST /tokenplan/api-keys 等                 | 生成 Key、分配/回收席位、成员管理                               | 写操作，未调用                         |

穷尽验证过的参数：`PageNo/PageSize/SeatType/QueryAssigned/StatusList`、私有参数 `CallerUacAccountId=<主账号 UID>`、`NamespaceId=namespace-1`、`OrgId=org_<占位>` —— 结果一致为空。

**结论**：管控面只暴露 org/座席/共享包（团队版维度）。个人版不在此体系内，数据为空属正常。

## 二、官方 CLI（bailian-cli，GitHub: modelstudioai/cli）调研

命令结构：

- `bl usage stats / summary / free` —— 走 **控制台会话网关**：`bailian-cs.console.aliyun.com` + `BroadScopeAspnGateway`，内部 API 为 `zeldaEasy.bailian-telemetry.model.getModelUsageStatistic` / `listModelUsageStatisticData`（模型调用统计）与 `zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota`（免费额度）。鉴权 `auth: "console"`，**需浏览器 OAuth 登录，AK/SK 不可调**。
- `bl token-plan list-seats / create-key / add-member / assign-seats` —— 走 ModelStudio OpenAPI（AK/SK，即上文已实现的那套）。
- `bl auth login --config token-plan --api-key sk-sp-xxx` —— Token Plan 个人版数据面 Key（`sk-sp-` 前缀），用于**模型调用**（数据面 host：`token-plan.<region>.maas.aliyuncs.com`），不含用量查询。

**结论**：CLI 的用量统计全部依赖控制台会话，没有任何 AK 可用的个人版用量接口。

## 三、GitHub 社区调研

| 仓库                                    | 内容                                                      | 是否有用量查询  |
| --------------------------------------- | --------------------------------------------------------- | --------------- |
| tmdgusya/omp-alibaba-maas（⭐24）       | Token Plan 数据面调用集成（chat/图像/视频，`sk-sp-` Key） | ❌ 无           |
| Eyozy/minimax-usage（⭐15）             | MiniMax Token Plan 用量查询                               | 仅 MiniMax 平台 |
| StaticB1/claude_ai_usage_widget（⭐21） | Claude Code 套餐用量 widget                               | 仅 Claude       |

**结论**：社区没有百炼 Token Plan 用量查询的成功实现——因为官方未开放。

## 四、个人版用量可能的数据通道（未来）

1. ModelStudio OpenAPI 后续版本可能新增个人版额度/用量只读接口（TokenPlan API 家族 2026-06 才上线，仍在扩充）。
2. 控制台会话方式（仿官方 CLI）：`bl auth login --console` 浏览器登录 → 会话调 telemetry API。技术可行但需处理登录与过期，暂缓。

## 五、决策

**暂不实现个人版用量查询，等待官方新增 API。** 仪表盘保留已实现的管控面视图（TokenPlan 账户/组织/成员/座席/共享包）。

---

## 六、2026-09-14 复议：个人版用量已可查（结论更新）

官方新增了一批**数据面 API 文档**（`Authorization: Bearer {DASHSCOPE_API_KEY}`），
但**实测网关尚未开放**：

| API（文档地址）                    | 文档 Endpoint                                                    | 实测        |
| ---------------------------------- | ---------------------------------------------------------------- | ----------- |
| get-subscription-stats             | `GET dashscope.aliyuncs.com/api/v1/tokenplan/subscription/stats` | 404（空体） |
| get-subscription-seat-details      | `GET .../api/v1/tokenplan/subscription/seat-detail`              | 404（空体） |
| get-token-plan-account-detail      | `GET .../api/v1/tokenplan/account`                               | 404（空体） |
| get-organization                   | `GET .../api/v1/tokenplan/organization`                          | 404（空体） |
| get-organization-member-seat-stats | `GET .../api/v1/tokenplan/organization/member-seat-stats`        | 404（空体） |
| list-organization-members          | `GET .../api/v1/tokenplan/organization/members`                  | 404（空体） |

**判定依据（区分「路由缺失」与「鉴权失败」）**：
同一网关下已存在的真实路由 `GET /api/v1/tasks/x` 在无/错 Key 时返回 **401 + JSON 错误体**
（`{"code":"InvalidApiKey",...}`），而 `/api/v1/tokenplan/*` 一律返回 **404 + `content-length: 0`**
（server: istio-envoy）——路由未注册，而非 Key 无效。
`token-plan.cn-beijing.maas.aliyuncs.com` 同路径同样 404。

### 可用路径：官方 CLI 的控制台会话链路（已原生移植）

官方 CLI 源码 `modelstudioai/cli` 显示 `bl usage token-plan` 的真实实现：

1. `bl usage token-plan` → api `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage`，`auth: "console"`。
2. `bl console call` → `callConsoleGateway()`：`POST https://bailian-cs.console.aliyun.com/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=<api>`，
   Header `Authorization: Bearer <console token>`，Body `params=<JSON>&region=cn-beijing`。
   `params` 形如 `{Api, V:"1.0", Data:{…, cornerstoneParam:{protocol:"V2",console:"ONE_CONSOLE",productCode:"p_efm",switchUserType:3,consoleSite:"BAILIAN_ALIYUN"}}}`。
3. console token 来源：`GenerateCLIAccessToken`（`POST https://modelstudio.cn-beijing.aliyuncs.com/modelstudio/cli/generateAccessToken`，
   `x-acs-action: GenerateCLIAccessToken`，`x-acs-version: 2026-02-10`，**ACS3-HMAC-SHA256** 签名）。

**本仓库实测（用真实 AK/SK）**：ACS3 签名**通过**——网关返回
`403 / Code=NoPermission / AccessDeniedDetail.AuthAction=modelstudio:GenerateCLIAccessToken`
（若签名有误会返回 `SignatureDoesNotMatch`）。即：链路可行，仅缺 RAM 授权。

### 个人版用量字段（四接口）

响应信封：`root.data.DataV2.data.data`（`reset-card/list` 的内层是**数组**，需单独处理）。

| 接口                                | 字段                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `…/personal/api/v2/usage`           | `per5HourPercentage` `per5HourResetTime` `per1WeekPercentage` `per1WeekResetTime`        |
| `…/personal/api/v2/subscription`    | `instanceCode` `specCode` `status` `remainingDays` `startTime` `endTime` `autoRenewFlag` |
| `…/personal/api/v2/addon/summary`   | `remainingCredits` `totalCredits` `activeCount`                                          |
| `…/personal/api/v2/reset-card/list` | `[{cardType, effectiveAt, expiresAt, cardNo}]`（重置卡）                                 |

**百分比语义（重要）**：`per*Percentage` 返回的是 **0-1 比值**，不是百分数。
真实抓包 `per1WeekPercentage = 0.2750906925` 对应控制台 **27.51%**；
官方 CLI 与社区参考实现（AliyunTokenBar）均按 **×100** 展示，故本模块统一换算并钳制到 0-100。
（早期实现误当百分数直接展示，已修正。）

**5 小时窗口**：官方已下线该窗口，`per5Hour*` 两个字段均不出现；缺失时置 `null`，展示层隐藏该行。

### 落地

- 新增 `server/aliyun-console.ts`，接入 `/api/aliyun/tokenplan` 的 `personal` 字段
  （独立容错切片，失败不影响组织/座席视图）。
- 平台兼容：全部基于 Web Crypto，可在 Bun / Cloudflare Workers 运行，无需安装 `bl` CLI。
- 若官方后续开放 `dashscope.aliyuncs.com/api/v1/tokenplan/*`，可在此模块内平滑切换为首选通道。

---

## 七、2026-09-14 二次复议：控制台 Cookie 通道（**首选，已实测可用**）

上一节基于 CLI 源码推导出「AK/SK → cliAccessToken → `/cli/api.json`」链路，
但该链路**需要 RAM 授权**，多数用户开箱即用体验差。

对百炼控制台页面本身抓包后发现：页面走的是**另一套更简单**的入口——
**Cookie 鉴权 + `/data/api.json`**，无需 AK/SK、无需任何 RAM 授权：

```
POST https://bailian-cs.console.aliyun.com/data/api.json
     ?action=BroadScopeAspnGateway&product=sfm_bailian
     &api=zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/{usage|subscription|addon/summary|reset-card/list}
     &_v=
Body: params=<JSON>&region=cn-beijing
Cookie: login_aliyunid_ticket=…（其余 Cookie 均非必需）
```

### 实测结论（真实账号）

| 探针                           | 结果                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 全量 Cookie + Origin/Referer   | 200，返回真实用量                                                            |
| **仅 `login_aliyunid_ticket`** | **200，返回真实用量**（→ 最小可用凭据）                                      |
| 去掉 Origin / Referer          | 200（→ 两个头非必需）                                                        |
| 去掉 `sec_token` 表单字段      | 200（→ 非必需）                                                              |
| 无 Cookie                      | HTTP 200 + `data.success=false`，`errorCode=BailianGateway.Login.NotLogined` |

失败体是**HTTP 200 + 业务 success:false**，不能用状态码判断，必须解析
`data.success` / `data.errorCode`；`…NotLogined` 映射为「控制台会话已失效，需更新 Cookie」。

**踩坑记录（已修）**：控制台 Cookie 的 `login_aliyunid_ticket` **值**本身不含 `=`。
若把裸值直接当作 `Cookie` 请求头发出（即 `cookie: <ticket 值>`），请求里就没有
`name=value` 结构，网关一律判为未登录（`BailianGateway.Login.NotLogined`），
表现得像「Cookie 过期」，极易误判。故 `normalizeSessionCookie()` 在缺少 `=` 时
自动补 `login_aliyunid_ticket=` 前缀；`ALIYUN_TOKENPLAN_COOKIE` 因此同时接受
裸值与整段 Cookie 头两种写法。

### 踩坑记录（第二例）：本地 `.env` 的 `$` 展开会静默截断 ticket

该 ticket 的值里含**字面 `$`**（形如 `…CT58JlM_1t$w3j6$SFnA3gvHMS14Yv8bT*…`），
而本地环境加载器**都会做 `$VAR` 变量展开**——实测 Bun 的 `.env` 加载器与
Vite 的 `loadEnv()`（`vite.config.ts` 用的就是它）**行为完全一致**：

| 写法                      | 结果                                         |
| ------------------------- | -------------------------------------------- |
| 裸 `$w3j6`                | 被当作变量名，**展开为空**（153 → 130 字符） |
| `\$w3j6`（反斜杠转义）    | ✅ 保留字面 `$`                              |
| `"…$w3j6…"`（双引号包裹） | ❌ 仍然展开（引号不阻止展开）                |
| `'…$w3j6…'`（单引号包裹） | ❌ 仍然展开                                  |
| `${w3j6}`                 | 保留为字面 `${w3j6}`（多了花括号，值仍不对） |
| `%24`（百分号编码）       | 原样保留 `%24`（未解码，值不对）             |

**丢失 23 个字符、没有任何警告**，发到网关后同样只会得到 `NotLogined`——
与「会话真过期」**完全同形**，实测中一度被误判为 Cookie 失效。

因此：

- 本地 `.env` / `.dev.vars`：每个字面 `$` 必须写成 `\$`（加引号无效）。
- 平台面板（Vercel / EdgeOne Makers / Workers Secret）：**不做展开**，
  直接粘原值，**不要**加反斜杠。
- 平台面板另有「值不能含空格/换行/制表符」的限制，故**只粘 ticket 的值**
  （无空白字符），不要粘整段 `Cookie` 头（含 `; ` 空格）。

为让该故障在报错当下可自证，`sessionExpiredHint()` 会在 `ConsoleSessionExpired`
的提示后附上**当前配置值的长度**（仅长度，不含内容）：与浏览器中复制的值比对，
明显偏短即为被展开截断。

### 双通道设计

`fetchAliyunPersonalPlan({ cookie?, credentials? })`：**Cookie 优先**，AK/SK 兜底；
两者都无则抛 `InvalidCredentials`。前端在「个人版套餐用量」标题旁标注数据来源
（`会话 Cookie` / `AK/SK`）。

账号来源列表 = AK/SK 账号 ∪ 仅有 Cookie 的账号，按序号配对
（同一账号的 AK/SK 管组织/座席，Cookie 管个人版用量）；
仅有 Cookie 时该账号展示为「仅配置会话 Cookie」，组织/座席区块自动隐藏。

### 安全与运维

`ALIYUN_TOKENPLAN_COOKIE` 等同账号会话凭据，**等价于登录态**：
仅放在服务端环境变量（`.env` / wrangler secret），勿提交、勿下发到前端。
会话过期（通常数周）后重新复制 `login_aliyunid_ticket` 即可。
