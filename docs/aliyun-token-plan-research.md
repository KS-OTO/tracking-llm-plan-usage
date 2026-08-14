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

穷尽验证过的参数：`PageNo/PageSize/SeatType/QueryAssigned/StatusList`、私有参数 `CallerUacAccountId=1775440997202213`、`NamespaceId=namespace-1`、`OrgId=org_6060...` —— 结果一致为空。

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
