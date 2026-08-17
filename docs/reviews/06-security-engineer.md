# 安全工程师审查报告

## 审查范围与视角

从安全工程视角对全栈做只读审查，覆盖：密钥暴露面（前端/服务端/日志）、签名实现正确性（火山 v4 / 阿里云 RPC+ROA）、SSRF 与请求构造、CORS 与安全响应头、输入校验、`.gitignore` 与构建产物泄露。

审查方法：逐文件 `read` 取证，对 `.edgeone/` 构建产物做密钥扫描（grep），用 `git check-ignore` / `git status` 确认追踪与忽略状态。

---

## 问题清单

| 严重度 | 位置(文件:行/符号)                                                               | 问题描述                                                                                                                                                                                                                                                                                                                                                                                                                   | 修复建议                                                                                                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | `.edgeone/cloud-functions/api-node/index.mjs:5972-5981`                          | **构建产物泄露全部明文密钥。** EdgeOne 构建工具在打包时读取 `.env`，将 7 个真实凭据以明文 `var env = {…}` 硬编码进 318 KB 编译产物：DeepSeek API Key、火山 AccessKeyId+SecretKey(base64)、智谱 API Key、阿里云 AccessKeyId+SecretKey、模力方舟 API Key。第 5982 行 `Object.assign(env, process.env)` 确认这些 baked 值在运行时作为基线 env 实际生效（非仅注释/调试）。已用 `read` 直接确认这些是与 `.env` 一致的真实凭据。 | **立即行动**：(1) 轮换全部 7 个密钥——它们已写入磁盘产物，视为已泄露。(2) 将 `.edgeone/` 加入 `.gitignore`（当前 `git check-ignore` 返回 exit 1=未忽略，`git status` 显示 `?? .edgeone/`）。(3) 确认 EdgeOne 控制台 EnvVars 使用运行时注入而非构建时嵌入；如果 Makers CLI 强制读 `.env`，改为在 CI 中用临时 `.env` 或 secret 管理器注入，构建后删除。 |
| **P0** | `.gitignore`（全文 47 行）                                                       | **`.edgeone/` 未被忽略。** `.gitignore` 无 `.edgeone` 条目（`grep edgeone .gitignore` 无匹配）。`.edgeone/` 包含上述含密钥的构建产物，当前虽 untracked，但一次 `git add .` 即可将 7 个明文密钥提交进仓库。对开源项目（README 标注"开源网页工具"）这是灾难级泄露。                                                                                                                                                          | 在 `.gitignore` 追加 `.edgeone/`。同时追加 `.dev.vars`（当前已在第 46 行）确认生效。已确认 `.env` 和 `.dev.vars` 本身未被 git 追踪（`git ls-files` 无结果），这两个是安全的。                                                                                                                                                                        |
| **P1** | `server/app.ts:389-431`（dispatch，全局）                                        | **API 无任何认证/鉴权。** 所有 `/api/*` 端点零认证即可访问。Bun 默认 `127.0.0.1` 可接受，但 `wrangler.toml:6` 设 `workers_dev = true`（部署后获得公网 `*.workers.dev` URL），EdgeOne 同样公网可达。任何人发现 URL 即可读取全部 LLM 余额/用量/套餐明细（含 `/api/status` 的 keyHint 掩码、各账号消费数据）。README 无任何安全告警。                                                                                         | (1) 为 Workers/EdgeOne 部署增加认证层：共享 token（`?token=` 或 `Authorization` 头校验）、Cloudflare Access、或 IP allowlist。(2) 至少在 README 的"部署"章节明确标注风险并提供最小防护方案。(3) Bun 本地模式保持 `127.0.0.1` 默认即可，但增加文档说明改 `HOST=0.0.0.0` 的风险。                                                                      |
| **P1** | `server/app.ts:81-86`（`json()` 函数）；`server/index.ts:40-64`（`serveStatic`） | **API 响应缺少 `Cache-Control: no-store`。** 余额/用量等敏感财务数据未禁用缓存，浏览器和中间代理可缓存 JSON 响应。用户 A 查看后、用户 B 在同机查看可能命中缓存看到 A 的数据；浏览器后退按钮也可能展示缓存。                                                                                                                                                                                                                | `json()` 函数的 headers 增加 `'cache-control': 'no-store'`。`serveStatic` 对非 `.html` 静态资源也应考虑 `cache-control` 策略。                                                                                                                                                                                                                       |
| **P1** | `server/app.ts:81-86`；`server/index.ts:40-64`                                   | **缺少安全响应头。** 全部 HTTP 响应无 `X-Frame-Options`（或 CSP `frame-ancestors`）、无 `X-Content-Type-Options: nosniff`、无 `Content-Security-Policy`。作为展示财务数据的仪表盘，可被 iframe 嵌套做点击劫持（clickjacking）；无 `nosniff` 允许 MIME 嗅探。                                                                                                                                                               | 在 `json()` 和 `serveStatic` 统一注入安全头：`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。如可行，增加基础 CSP。                                                                                                                                                                                      |
| **P2** | `server/app.ts:423-429`（顶层 catch）                                            | **内部错误信息原样返回客户端。** `error instanceof Error ? error.message : String(error)` 将底层异常消息直接返回。虽不含密钥（签名/网络错误消息不含 key），但会泄露实现细节（如代码路径、未处理异常的变量名），属于信息泄露。                                                                                                                                                                                              | 生产环境返回通用消息 `"内部错误，请查看服务端日志"`，详细信息仅 `console.error` 到日志（第 424 行已做）。                                                                                                                                                                                                                                            |
| **P2** | `server/app.ts:132-141`（`runAccounts`）                                         | **供应商错误响应原样透传前端。** 各客户端将供应商 API 返回的 error message/text（最多 200 字符）放入 `error` 字段返回前端。在公网部署上，攻击者可通过错误消息探测已配置的供应商、接口状态。                                                                                                                                                                                                                                | 对公网部署考虑脱敏供应商错误文本；本地模式可保留以便诊断。或在错误消息中去除供应商返回的原始响应片段。                                                                                                                                                                                                                                               |
| **P2** | `server/volc.ts:82-85`（`arkCall` queryString 构造）                             | **Volc 请求 URL 的 query string 未做 URL 编码。** 拼接方式 `${key}=${value}` 无 `encodeRfc3986`，而 `signVolcRequest`（`sign.ts:105-108`）签名时使用了编码。当前 query 值全为字母数字常量（`Action=GetAFPUsage` 等），无实际注入风险；但签名用编码值、实际请求用未编码值，两者不一致是潜在 bug——若未来 query 值含特殊字符会导致签名不匹配或注入。                                                                          | `arkCall` 中构造 queryString 也用 `encodeRfc3986`，与 `signVolcRequest` 保持一致。                                                                                                                                                                                                                                                                   |
| **P2** | `server/app.ts:389-421`（dispatch）                                              | **无 HTTP 方法校验。** 所有端点接受任意方法（GET/POST/PUT/DELETE/PATCH），未限制为 GET（所有处理函数均为只读查询）。虽不会造成写入破坏（下游供应商 API 需独立签名/鉴权），但违反最小权限原则。                                                                                                                                                                                                                             | dispatch 层增加 `request.method !== 'GET'` → 405 Method Not Allowed 的前置检查。                                                                                                                                                                                                                                                                     |
| **P3** | `server/app.ts:74-79`（`maskKey`）；`src/utils.ts:2-7`                           | **`maskKey` 暴露首尾各 4 位（共 8 字符）。** 对 `key.length <= 8` 的 key 全掩码为 `****`，否则保留 `first4 **** last4`。在公网 `/api/status` 上，8 字符泄露可帮助识别 key 格式/前缀。两处实现相同（`server/app.ts` 和 `src/utils.ts`），存在维护不一致风险。                                                                                                                                                               | 公网部署可进一步收紧掩码（如仅保留后 4 位或完全不暴露 keyHint）。将 `maskKey` 提取到共享模块消除重复。                                                                                                                                                                                                                                               |
| **P3** | `worker/index.ts:19-30`（`fetch`）                                               | **每次请求重建 handler。** `createAppHandler` 在 `fetch` 内调用，每请求重新 `readKeys` / `readKeyPairs` 扫描全部 env 变量。性能开销可忽略，但公网部署下无速率限制，配合无认证（见 P1）可被用于放大上游供应商 API 调用、消耗供应商配额。                                                                                                                                                                                    | 公网部署增加速率限制（Cloudflare Rate Limiting Rules 或应用层）。handler 可在模块级缓存（Workers 同一 isolate 内复用）。                                                                                                                                                                                                                             |

---

## 密钥暴露面专项确认

以下维度经逐文件取证，确认安全状态：

| 维度                         | 结论     | 证据                                                                                                                                                                                                                                                                                            |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端是否接触明文 key         | **否**   | `src/api.ts:23-58` 所有请求走同源 `/api/*`，响应仅含 `keyHint` 掩码。`src/types.ts:19` `AccountEnvelope` 仅声明 `keyHint: string`。前端 `maskKey`（`utils.ts:2-7`）未被任何组件实际调用（仅测试文件引用），服务端已掩码后下发。                                                                 |
| `maskKey` 实现正确性         | **正确** | `server/app.ts:74-79`：`length <= 8` 全掩码；否则 `first4 **** last4`。逻辑无误，未出现 key 透传。                                                                                                                                                                                              |
| `console.error` 是否打印 key | **否**   | 全 server 仅两处日志：`app.ts:424` 打印 error 对象（供应商异常，不含 key）；`index.ts:81` 打印监听地址。签名客户端（sign/aliyun/tokenplan）的 `String(cause)` 为 fetch 网络异常消息，不含 URL/header/body。                                                                                     |
| 签名 HMAC 实现               | **正确** | 火山 v4（`sign.ts`）：HMAC-SHA256 派生密钥链 `date→region→service→request`，canonical request 五段拼接，`encodeRfc3986` 编码正确。阿里云 RPC（`aliyun.ts:59-64`）：HMAC-SHA1 + `SecretKey&` 密钥。阿里云 ROA（`aliyun.ts:74-96`）：HMAC-SHA1 + 裸 SecretKey。nonce 均用 `crypto.randomUUID()`。 |

## SSRF 专项确认

**无 SSRF 风险。** 全部 `fetch` 目标 URL 为硬编码常量：

| 客户端            | URL 来源                                                 | 用户可控部分                                                 |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `deepseek.ts:28`  | 硬编码 `https://api.deepseek.com/user/balance`           | 无                                                           |
| `aliyun.ts:159`   | 硬编码 `https://business.aliyuncs.com/`                  | `productCode` 经 `aliyunEncode` 编码后入 POST body           |
| `tokenplan.ts:61` | 硬编码 `ENDPOINT` + 固定 path + `URLSearchParams(query)` | query 值为内部生成的页码，非用户输入                         |
| `volc.ts:85`      | 硬编码 `ARK_PLAN_HOST` / `ARK_OPEN_HOST`                 | `model`/`modelEndpoint` 经 `JSON.stringify` 编码入 POST body |
| `balances.ts:35`  | 硬编码各家 base URL                                      | 无                                                           |
| `zhipu.ts:52`     | 硬编码 base URL                                          | 无                                                           |

无任何 `fetch` 的 host/path 由用户输入构造。用户可控的 `days`/`productCode`/`model`/`modelEndpoint` 均经过数值钳制（`dateRange` Math.min/max）、`.trim()` 清洗、或 JSON 编码/URL 编码后注入下游，不存在注入面。

## 输入校验专项确认

| 参数            | 校验                                                       | 位置                 | 结论                                                 |
| --------------- | ---------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| `days`          | `Math.min(90, Math.max(1, Number(daysParam ?? 7) \|\| 7))` | `app.ts:107`         | ✅ 钳制 [1,90]，`NaN` 回退 7                         |
| `productCode`   | `?.trim() \|\| undefined`                                  | `app.ts:319`         | ✅ trim + 空值转 undefined，下游 `aliyunEncode` 编码 |
| `model`         | `?.trim() \|\| undefined`                                  | `app.ts:362`         | ✅ trim + JSON 编码入 body                           |
| `modelEndpoint` | `?.trim() \|\| undefined`                                  | `app.ts:363`         | ✅ trim + JSON 编码入 body                           |
| Worker env 注入 | `typeof value === 'string' ? value : undefined`            | `worker/index.ts:22` | ✅ 仅接受 string 类型 binding                        |

## `.gitignore` 专项确认

| 文件/目录                            | 是否追踪  | 是否忽略                     | 风险                       |
| ------------------------------------ | --------- | ---------------------------- | -------------------------- |
| `.env`                               | ❌ 未追踪 | ✅ 已忽略（`.gitignore:18`） | 安全                       |
| `.dev.vars`                          | ❌ 未追踪 | ✅ 已忽略（`.gitignore:46`） | 安全                       |
| `.env.example`                       | ✅ 已追踪 | —                            | 安全（占位符值）           |
| `.dev.vars.example`                  | ✅ 已追踪 | —                            | 安全（占位符值）           |
| `.edgeone/`                          | ❌ 未追踪 | **❌ 未忽略**                | **P0：含明文密钥构建产物** |
| `cloud-functions/api/[[default]].js` | ✅ 已追踪 | —                            | 安全（源码，无密钥）       |

---

## 总结与优先级建议

### 最高优先级（P0，立即处理）

**`.edgeone/` 构建产物泄露全部明文密钥 + 未被 `.gitignore` 忽略**——这两个问题叠加构成当前最高危风险。EdgeOne 构建工具将 `.env` 中的 7 个真实凭据以明文烘焙进 `.edgeone/cloud-functions/api-node/index.mjs`，而该目录未被 git 忽略，距离 `git add . && git push` 仅一步之遥。对标注"开源"的项目，一旦推送即等于公开全部 LLM 平台密钥。

**立即行动清单：**

1. **轮换全部 7 个密钥**（DeepSeek / 火山 AccessKey+Secret / 智谱 / 阿里云 AccessKey+Secret / 模力方舟）——它们已写入磁盘产物，按安全惯例视为已泄露。
2. `.gitignore` 追加 `.edgeone/`。
3. 调查 EdgeOne 构建流程为何将 `.env` 烘焙进产物，改为运行时注入或 CI 临时密钥。

### 高优先级（P1，公网部署前必须解决）

- API 无认证（Workers/EdgeOne 公网可达）。
- API 响应缺 `Cache-Control: no-store`（余额数据可被缓存）。
- 缺安全响应头（`X-Frame-Options` / `X-Content-Type-Options` / CSP）。

### 中优先级（P2，安全加固）

- 错误信息原样返回客户端（信息泄露）。
- Volc query string 未 URL 编码（签名/请求不一致的潜在 bug）。
- 无 HTTP 方法校验。

### 积极面

签名实现（火山 v4 / 阿里云 RPC / 阿里云 ROA）经逐行审查**正确无误**：HMAC 算法、密钥派生、nonce、时间戳、编码均符合各平台规范。密钥仅在服务端 env 中，前端**完全不接触明文 key**，`maskKey` 掩码实现正确。`console.error` 不打印密钥。SSRF 面为零（全部 fetch URL 硬编码）。输入校验（days/productCode/model）钳制与清洗到位。`.env` 和 `.dev.vars` 已被正确忽略。
