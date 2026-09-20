/**
 * 平台无关的 API 处理核心。
 *
 * 通过 createAppHandler(env) 构建请求处理器：
 * - Bun 入口（server/index.ts）：Bun.serve + 静态资源
 * - Cloudflare Workers 入口（worker/index.ts）：env.ASSETS 静态资源
 * - Vite dev 中间件（vite.config.ts）：开发模式单进程
 *
 * 环境变量通过 EnvGetter 抽象注入（Bun: process.env；Worker: bindings）。
 */
import { fetchOpenRouterDetail } from './balances.ts'
import { cachedQuery } from './cache.ts'
import { queryResourcePackageInstances, type AliyunCredentials } from './aliyun.ts'
import { fetchAliyunPersonalPlan, type AliyunPersonalPlan } from './aliyun-console.ts'
import { fetchDeepSeekBalance } from './deepseek.ts'
import { fetchQianfanData, type BaiduCredentials } from './baidu.ts'
import { fetchGiteePackageBalance, fetchGiteeVoucher } from './gitee.ts'
import { fetchOpenCodeGoUsage } from './opencode.ts'
import { fetchKimiPlan, fetchMiniMaxPlan, type TokenPlanInfo } from './plans.ts'
import { fetchNewApi, type NewApiAccountData } from './newapi.ts'
import {
  readIncompletePairs,
  readKeyPairs,
  readKeys,
  readPairedMap,
  type EnvGetter,
} from './multi.ts'
import { getTokenPlanAccount, getTokenPlanSeats, getTokenPlanSharedPackages } from './tokenplan.ts'
import { getZhipuAccountBalance, getZhipuCodingPlanQuota, getZhipuTokenPackages } from './zhipu.ts'
import {
  getAfpUsage,
  getCodingPlanUsage,
  getUsageDetails,
  getInferenceUsage,
  getPersonalPlan,
  type VolcCredentials,
} from './volc.ts'

/**
 * LLM 用量监控 server.
 *
 * Reads provider credentials from environment variables:
 *   DEEPSEEK_API_KEY        DeepSeek API key (余额查询)
 *   VOLC_ACCESS_KEY_ID      火山方舟 Access Key ID（管控面 API）
 *   VOLC_SECRET_KEY         火山方舟 Secret Access Key
 *   ZHIPU_API_KEY           智谱开放平台 API Key（资源包/余额）
 *   ALIYUN_ACCESS_KEY_ID    阿里云 AccessKey ID（BSS 资源包 / Token Plan）
 *   ALIYUN_SECRET_KEY       阿里云 AccessKey Secret
 *   ALIYUN_TOKENPLAN_COOKIE 百炼控制台会话 Cookie（可选，仅个人版用量；无需 RAM 授权）
 *   OPENCODE_GO_API_KEY     OpenCode Go 订阅额度（usage.rolling / weekly / monthly）
 *   HOST / PORT             监听地址（默认 127.0.0.1:8787）
 *
 * 账号别名（可选）：`<PREFIX>_LABEL` / `<PREFIX>_LABEL_N` 与同序号凭据配对，
 * 前端优先展示别名，Key 掩码退居次要位置（详见 README「账号别名」）。
 *
 * Serves the built frontend from dist/ plus /api/* endpoints.
 * Dev mode: run `vp dev` (Vite proxies /api to this server).
 */

function maskKey(key: string): string {
  if (key.length <= 8) {
    return '****'
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** 常见错误码的中文说明，原始英文信息保留在 message 中供诊断。 */
const ERROR_HINTS: Record<string, string> = {
  NOT_CONFIGURED: '未配置对应密钥',
  NetworkError: '网络请求失败',
  NotAuthorized: '无访问权限（RAM 策略不足）',
  InvalidAccessKeyId: 'AccessKey 不存在或无效',
  'InvalidAccessKeyId.NotFound': 'AccessKey 不存在或无效',
  SignatureDoesNotMatch: '签名不匹配',
  InvalidResponse: '供应商返回了无法解析的响应',
  ENDPOINT_GONE: '接口已下线',
}

/** 按账号错误码的中文提示（子串匹配原始 message）。 */
const ACCOUNT_ERROR_HINTS: Array<{ pattern: string; hint: string }> = [
  { pattern: 'NotAuthorized', hint: '无访问权限（RAM/IAM 策略不足）' },
  { pattern: 'InvalidAccessKeyId', hint: 'AccessKey 不存在或无效' },
  { pattern: 'SignatureDoesNotMatch', hint: '签名不匹配（SecretKey 可能填错）' },
  { pattern: 'NetworkError', hint: '网络请求失败' },
  { pattern: 'InvalidResponse', hint: '供应商返回了无法解析的响应' },
  { pattern: 'InvalidApiKey', hint: 'API Key 无效' },
  { pattern: 'Unauthorized', hint: '鉴权失败（Key 可能已失效）' },
  { pattern: 'CookieExpired', hint: '会话 Cookie 已过期，需重新获取' },
  { pattern: 'Forbidden', hint: '无权限访问该资源' },
  { pattern: 'ConsoleSessionExpired', hint: '百炼控制台会话已失效，需更新 Cookie' },
  { pattern: 'OpenCodeGo_HTTP_401', hint: 'OpenCode Go API Key 无效或已失效' },
  { pattern: 'OpenCodeGo_HTTP_403', hint: 'OpenCode Go 无权限（该 Key 可能未开通订阅）' },
  {
    pattern: 'Zhipu_500',
    hint: '智谱上游内部错误（未订阅 GLM Coding Plan 的账号查额度也会这样报，可先到控制台确认订阅状态）',
  },
  { pattern: 'Zhipu_1000', hint: '智谱 API Key 无效或已失效' },
  { pattern: 'Zhipu_1001', hint: '未携带鉴权头（智谱 API Key 可能是空值）' },
]

function errorResponse(status: number, code: string, message: string): Response {
  const hint = ERROR_HINTS[code]
  const displayMessage = hint && hint !== message ? `${hint}：${message}` : message
  return json({ error: { code, message: displayMessage } }, status)
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateRange(daysParam: string | null): { start: string; end: string } {
  const days = Math.min(90, Math.max(1, Number(daysParam ?? 7) || 7))
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  return { start: formatDate(start), end: formatDate(end) }
}

interface AccountEntry<T> {
  keyHint: string
  label?: string
  run: () => Promise<T>
}

/**
 * Token Plan 个人版用量切片（判别联合）：成功携带 data，失败仅含 error。
 * 与账号级容错解耦——个人版查询失败不影响组织/座席视图渲染。
 */
type PersonalSlice = { data: AliyunPersonalPlan } | { error: string }

/**
 * 子查询切片（判别联合）：成功带 data，失败只带 error。
 *
 * 用途与 `PersonalSlice` 相同——把「某个子查询挂了」和「这个账号整体查不了」分开。
 * 智谱的 Coding Plan 额度接口对**未订阅**的账号会直接返回 `code:500 内部服务器错误`
 * （上游没做空态），而同一个 Key 查余额、查资源包都是好的；不切片的话，一个子接口
 * 的 500 会让整张卡片连余额一起消失，用户以为 Key 坏了。
 */
type SubQuerySlice<T> = { data: T } | { error: string }

/** 把子查询的异常收敛成切片（返回的 promise 永不 reject）。 */
function subQuerySliceOf<T>(promise: Promise<T>): Promise<SubQuerySlice<T>> {
  return promise.then(
    (data): SubQuerySlice<T> => ({ data }),
    (cause: unknown): SubQuerySlice<T> => ({
      error: accountErrorHint(
        cause instanceof Error ? cause.message : String(cause),
        cause instanceof Error && 'code' in cause ? String(cause.code) : undefined,
      ),
    }),
  )
}

type AccountResult<T> =
  | (T & { keyHint: string; label?: string })
  | { keyHint: string; label?: string; error: string }

/**
 * 「未配置凭据」——**不是故障**。
 *
 * 与「查询失败」严格区分：前者是用户还没填 Key，卡片该显示中性空态（`t-empty`）；
 * 后者是真出了问题，该飘红。前端靠 `code === 'NOT_CONFIGURED'` 判定，
 * 因此这个码必须原样透传，不能被套上任何中文前缀。
 */
class NotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED'
}

/** `/api/usage` 里单个 provider 的容错切片（与前端 `UsageSlice` 同构）。 */
type UsageSliceResult<T> = { data: T } | { error: string; code: string }

/**
 * 把 provider 查询的成败收敛成切片（返回的 promise 永不 reject）。
 *
 * 这是 `/api/usage` 的关键：合并成一个端点后，**容错粒度必须保持不变** ——
 * 一个平台挂了只降级它自己那一格，其余 9 家照常返回（与 PR #17 智谱子查询容错同一原则）。
 */
async function usageSliceOf<T>(load: Promise<T>): Promise<UsageSliceResult<T>> {
  try {
    return { data: await load }
  } catch (cause) {
    const code = cause instanceof Error && 'code' in cause ? String(cause.code) : 'INTERNAL_ERROR'
    const raw = cause instanceof Error ? cause.message : String(cause)
    // 未配置原样透传：那条消息本身就是「该配哪个变量」的说明，再叠一层前缀反而更难读
    return { error: code === 'NOT_CONFIGURED' ? raw : accountErrorHint(raw, code), code }
  }
}

/** 火山「套餐用量明细」的统计区间（天）。常量而非用户输入，故并入 `/api/usage`。 */
const VOLC_PLAN_DAYS = 7

/**
 * 火山管控面查询接口的**区间上限**（天）。
 *
 * `GetUsageDetails` 与 `GetInferenceUsage` 都是 31 天封顶，超了直接 400
 * （实测：32 天可过，90 天回 `InvalidParameter.TimeRange: time range must be less than
 * 31 days`）。而 `dateRange` 允许到 90 天（其他平台能接受），所以火山这两条路径
 * 必须自己收口 —— 否则 `?days=60` 会让整张火山卡变成红色错误卡。
 */
const VOLC_MAX_RANGE_DAYS = 31

/** 火山专用区间：先夹到 31 天，再交给 `dateRange`。 */
export function volcDateRange(daysParam: string | null): { start: string; end: string } {
  const requested = Number(daysParam ?? VOLC_PLAN_DAYS) || VOLC_PLAN_DAYS
  return dateRange(String(Math.min(Math.max(1, requested), VOLC_MAX_RANGE_DAYS)))
}

/** 火山推理用量的缓存 TTL（秒）：它是按天聚合的表，1 分钟内不会变。 */
const INFERENCE_TTL_SECONDS = 60

/** 容错切片 → HTTP 响应：未配置是 503（中性空态），其余是 500（真故障）。 */
function sliceResponse(result: UsageSliceResult<unknown>): Response {
  if ('data' in result) {
    return json(result.data)
  }
  return errorResponse(result.code === 'NOT_CONFIGURED' ? 503 : 500, result.code, result.error)
}

/** 按账号错误的中文化提示：优先匹配错误类携带的 code 字段，回退 message 子串。 */
function accountErrorHint(message: string, code?: string): string {
  for (const { pattern, hint } of ACCOUNT_ERROR_HINTS) {
    if (code === pattern || (code && code.includes(pattern))) {
      return `${hint}：${message}`
    }
  }
  for (const { pattern, hint } of ACCOUNT_ERROR_HINTS) {
    if (message.includes(pattern)) {
      return `${hint}：${message}`
    }
  }
  return message
}

/**
 * 单个账号的执行结果：**成败都把自己的 entry 带上**。
 *
 * 这样就不必「按下标回查 entries」——那条路径依赖「results 与 entries 同源同长」这个
 * 隐式不变量，在 `noUncheckedIndexedAccess` 下既通不过类型检查、也只能用断言压过去。
 * 让结果自己带身份，不变量就不需要被假设。
 */
type AccountOutcome<T> =
  | { entry: AccountEntry<T>; value: T }
  | { entry: AccountEntry<T>; error: unknown }

/** 执行单个账号查询，把异常收敛进返回值（因此调用方拿不到 rejected promise）。 */
async function runAccount<T>(entry: AccountEntry<T>): Promise<AccountOutcome<T>> {
  try {
    return { entry, value: await entry.run() }
  } catch (error) {
    return { entry, error }
  }
}

/**
 * 并行执行多账号查询，每个账号独立容错，返回含 keyHint/label 的结果数组。
 *
 * 导出仅供单测调用：这是前端 `AccountEnvelope` 形态与「单账号失败不影响其余账号」容错
 * 契约的唯一真相源，必须能脱离网络被驱动。
 */
export async function runAccounts<T>(entries: AccountEntry<T>[]): Promise<AccountResult<T>[]> {
  // `runAccount` 永不 reject，因此 Promise.all 与 allSettled 等价：一个账号失败不会
  // 影响其余账号，且 `Promise.all` 保序 —— 顺序与 allSettled 完全一致
  const outcomes = await Promise.all(entries.map((entry) => runAccount(entry)))
  return outcomes.map((outcome) => {
    const { keyHint, label } = outcome.entry
    if ('error' in outcome) {
      const reason = outcome.error instanceof Error ? outcome.error.message : String(outcome.error)
      const reasonError = outcome.error instanceof Error ? outcome.error : null
      const code = reasonError && 'code' in reasonError ? String(reasonError.code) : undefined
      return { keyHint, label, error: accountErrorHint(reason, code) }
    }
    // 未配置别名时不写入 label 字段：否则会用 undefined 覆盖供应商响应里原有的
    // label（如 OpenRouter 的密钥名称），造成信息静默丢失
    const identity = label === undefined ? { keyHint } : { keyHint, label }
    return Object.assign({}, outcome.value, identity)
  })
}

function providerStatus(keyHints: string[]): {
  configured: boolean
  count: number
  keyHints: string[]
} {
  return { configured: keyHints.length > 0, count: keyHints.length, keyHints }
}

/**
 * 站点自定义（全部可选）：只影响前端外观与刷新节奏，不参与任何鉴权。
 *
 * 数值走 `/api/status` 由服务端**运行时**读取，而不是 `VITE_*` 构建期变量：
 * 本项目的同一份构建产物要跑在 Bun / Cloudflare Workers / EdgeOne / Vercel 四宿主上，
 * 而部署文档让用户在平台面板里配的就是运行时环境变量 —— 用构建期变量会变成
 * 「改个站点名要重新构建并重传产物」。
 *
 * 与 `src/types.ts` 的 `SiteConfig` 是同构契约（server 侧不 import src，故两边各声明一份，
 * 默认值必须保持一致）。
 */
export interface SiteConfig {
  /** 站点标题：导航栏品牌位 + 浏览器标签页。**可以为空串** —— 表示品牌位只显示 Logo，
   *  此时标签页标题回落到 `DEFAULT_SITE_NAME`（标签页不能没有名字）。 */
  name: string
  /** Logo 地址（明亮模式，也是暗黑模式的回落值）；未配置为 null（此时品牌位只显示文字）。 */
  logoUrl: string | null
  /** 暗黑模式专用的 Logo 地址；未配置为 null。
   *
   *  **不做镜像**：不把 `logoUrl` 复制到这里，前端才能区分「用户配了同一张图」和
   *  「用户没配暗色图」。回落逻辑放在前端 `pickLogoUrl()`（会顺带处理「暗色图挂了」）。 */
  logoUrlDark: string | null
  /** favicon 地址；未配置为 null（此时保留 index.html 里的 /favicon.ico）。 */
  faviconUrl: string | null
  /** 前端自动刷新间隔（秒）。 */
  refreshIntervalSeconds: number
}

export const DEFAULT_SITE_NAME = 'LLM 用量监控'
/** 3 分钟：与这些额度数据的实际变化节奏相称，比 60s 少 2/3 的无谓上游请求。 */
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 180
/** 刷新间隔允许范围（秒）：过小会打爆上游配额，过大则「自动刷新」形同虚设。 */
export const REFRESH_INTERVAL_RANGE = { min: 10, max: 3600 } as const

/** 空串 / 纯空白视为「未配置」：平台面板里留空是常见写法，不该渲染成破图。 */
function optionalUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** 刷新间隔钳制：非数字 / ≤0 / 越界一律回落（越界则钳到边界，非法则用默认值）。 */
function clampRefreshIntervalSeconds(value: string | undefined): number {
  const parsed = Number(value?.trim())
  if (value === undefined || value.trim() === '' || !Number.isFinite(parsed)) {
    return DEFAULT_REFRESH_INTERVAL_SECONDS
  }
  if (parsed <= 0) {
    return DEFAULT_REFRESH_INTERVAL_SECONDS
  }
  return Math.min(
    REFRESH_INTERVAL_RANGE.max,
    Math.max(REFRESH_INTERVAL_RANGE.min, Math.round(parsed)),
  )
}

/**
 * 站点名：区分「**没配过**」与「**显式配成空**」两种情况。
 *
 * - 变量缺失（undefined）→ 默认名：说明用户根本没动过这个开关，应该看到开箱即用的名字；
 * - 变量存在但为空 / 纯空白 → **空串**：用户明确要求品牌位不显示文字。
 *
 * 为什么必须区分：不少站点的 Logo 本身就是完整的字标（图形 + 品牌名），再跟一个站点名
 * 会变成「两个品牌名并排」，所以「只显示 Logo」是真实需求，不能悄悄回落成默认名。
 */
function readSiteName(value: string | undefined): string {
  return value === undefined ? DEFAULT_SITE_NAME : value.trim()
}

/**
 * 把要写进日志的值里的控制字符转义掉。
 *
 * 日志注入：`url.pathname` 由请求方控制，可以带 `\n` / `\r` —— 直接打印会让对方
 * **伪造出一行看起来像系统写的日志**（例如自己插一条 `[app] GET /api/xxx failed:`）。
 * 服务端日志常被当成排查证据看，行边界被污染就不是小事。
 *
 * 只转义 C0 控制字符（U+0000–U+001F）与 DEL（U+007F），
 * 中文 / 空格 / 普通标点都原样保留（可读性优先）。
 *
 * 为什么写成逐码点判断而不是 `/[\u0000-\u001F\u007F]/g`：正则里出现控制字符会被
 * `no-control-regex` 拦下（连 `\u0000` 转义形式也算），而那条规则顾虑的正是
 * 「控制字符在源码里看不见、易被误改」—— 写成显式码点比较正好回应了这个顾虑。
 */
export function logSafe(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    out += code <= 0x1f || code === 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : ch
  }
  return out
}

/** 站点自定义配置：任一变量缺失都回落到默认值，不抛错。 */
export function readSiteConfig(env: EnvGetter): SiteConfig {
  return {
    name: readSiteName(env('SITE_NAME')),
    logoUrl: optionalUrl(env('SITE_LOGO_URL')),
    logoUrlDark: optionalUrl(env('SITE_LOGO_URL_DARK')),
    faviconUrl: optionalUrl(env('SITE_FAVICON_URL')),
    refreshIntervalSeconds: clampRefreshIntervalSeconds(env('REFRESH_INTERVAL_SECONDS')),
  }
}

// 多账号：每个平台支持 N 组凭据（基础变量为第 1 组，`_2`、`_3`… 为后续组）
export function createAppHandler(env: EnvGetter) {
  // 多账号：每个平台支持 N 组凭据（基础变量为第 1 组，`_2`、`_3`… 为后续组）
  const DEEPSEEK_KEYS = readKeys('DEEPSEEK_API_KEY', env)
  const ZHIPU_KEYS = readKeys('ZHIPU_API_KEY', env)
  const GITEE_AI_KEYS = readKeys('GITEE_AI_API_KEY', env)
  // 代金券查询用的 Web 控制台会话 Cookie（可选；按 _N 后缀与同序号 API Key 精确配对，缺口不错位）
  const GITEE_AI_COOKIE_BY_KEY = readPairedMap('GITEE_AI_API_KEY', 'GITEE_AI_SESSION_COOKIE', env)
  const OPENROUTER_KEYS = readKeys('OPENROUTER_API_KEY', env)
  const KIMI_KEYS = readKeys('KIMI_API_KEY', env)
  const MINIMAX_KEYS = readKeys('MINIMAX_API_KEY', env)
  const OPENCODE_GO_KEYS = readKeys('OPENCODE_GO_API_KEY', env)
  // New API 是自托管服务：端点由各部署自己决定，因此凭据成对（站点地址 + 系统访问令牌）
  const NEWAPI_PAIRS = readKeyPairs('NEWAPI_BASE_URL', 'NEWAPI_TOKEN', env)
  // New-Api-User 请求头（可选）：管理员代查他人数据时按站点地址配对
  const NEWAPI_USER_ID_BY_URL = readPairedMap('NEWAPI_BASE_URL', 'NEWAPI_USER_ID', env)
  // 站点自定义（站点名 / Logo / favicon / 刷新间隔）：纯前端外观，不参与鉴权
  const SITE_CONFIG = readSiteConfig(env)

  const volcCredentialsList: VolcCredentials[] = readKeyPairs(
    'VOLC_ACCESS_KEY_ID',
    'VOLC_SECRET_KEY',
    env,
  ).map((pair) => ({ accessKey: pair.key, secretKey: pair.secret }))

  const aliyunCredentialsList: AliyunCredentials[] = readKeyPairs(
    'ALIYUN_ACCESS_KEY_ID',
    'ALIYUN_SECRET_KEY',
    env,
  ).map((pair) => ({ accessKey: pair.key, secretKey: pair.secret }))

  // 百炼控制台会话 Cookie（可选）：仅用于 Token Plan **个人版**用量查询，
  // 是一条独立于 AK/SK 的通道（无需 RAM 授权）。按序号与 ALIYUN_ACCESS_KEY_ID 配对；
  // Cookie 数量多于 AK/SK 时，多出的部分作为「仅有 Cookie」的独立账号。
  const ALIYUN_TOKENPLAN_COOKIES = readKeys('ALIYUN_TOKENPLAN_COOKIE', env)
  /**
   * Token Plan 查询来源：AK/SK（组织/座席/共享包）与会话 Cookie（个人版用量）按序号配对。
   * 同一账号两种凭据并存时合为一个来源，避免出现重复条目。
   */
  const aliyunTokenPlanSources = Array.from(
    { length: Math.max(aliyunCredentialsList.length, ALIYUN_TOKENPLAN_COOKIES.length) },
    (_, index) => {
      const credentials = aliyunCredentialsList[index]
      const cookie = ALIYUN_TOKENPLAN_COOKIES[index]
      return {
        credentials,
        cookie,
        keyHint: credentials ? maskKey(credentials.accessKey) : `cookie:${maskKey(cookie ?? '')}`,
      }
    },
  )
  const baiduCredentialsList: BaiduCredentials[] = readKeyPairs(
    'BAIDU_ACCESS_KEY_ID',
    'BAIDU_SECRET_KEY',
    env,
  ).map((pair) => ({ accessKey: pair.key, secretKey: pair.secret }))

  // 账号别名（可选）：*_LABEL / *_LABEL_N 与同序号 Key 配对；按平台命名空间隔离，
  // 避免跨平台复用同一凭据值时别名互相覆盖
  const LABELS = new Map<string, Map<string, string>>()
  const labelMap = (provider: string, keyPrefix: string, labelPrefix: string) => {
    LABELS.set(provider, readPairedMap(keyPrefix, labelPrefix, env))
  }
  labelMap('deepseek', 'DEEPSEEK_API_KEY', 'DEEPSEEK_LABEL')
  labelMap('volc', 'VOLC_ACCESS_KEY_ID', 'VOLC_LABEL')
  labelMap('zhipu', 'ZHIPU_API_KEY', 'ZHIPU_LABEL')
  labelMap('aliyun', 'ALIYUN_ACCESS_KEY_ID', 'ALIYUN_LABEL')
  labelMap('gitee', 'GITEE_AI_API_KEY', 'GITEE_LABEL')
  labelMap('openrouter', 'OPENROUTER_API_KEY', 'OPENROUTER_LABEL')
  labelMap('kimi', 'KIMI_API_KEY', 'KIMI_LABEL')
  labelMap('minimax', 'MINIMAX_API_KEY', 'MINIMAX_LABEL')
  labelMap('opencode', 'OPENCODE_GO_API_KEY', 'OPENCODE_GO_LABEL')
  labelMap('baidu', 'BAIDU_ACCESS_KEY_ID', 'BAIDU_LABEL')
  // New API 用站点地址做别名索引（同一站点可能配多个 Key）
  labelMap('newapi', 'NEWAPI_BASE_URL', 'NEWAPI_LABEL')
  // Cookie 专属的 Token Plan 账号没有 AK/SK 可配对，因此单列一组别名前缀
  // （已有 AK/SK 的账号仍优先用 ALIYUN_LABEL）
  labelMap('tokenplan-cookie', 'ALIYUN_TOKENPLAN_COOKIE', 'ALIYUN_TOKENPLAN_LABEL')
  const labelOf = (provider: string, key: string): string | undefined =>
    LABELS.get(provider)?.get(key)

  // 半配置检测：只配了 Key 没配 SecretKey（或反之）的变量名
  const INCOMPLETE_VARS = [
    ...readIncompletePairs('VOLC_ACCESS_KEY_ID', 'VOLC_SECRET_KEY', env),
    ...readIncompletePairs('ALIYUN_ACCESS_KEY_ID', 'ALIYUN_SECRET_KEY', env),
    ...readIncompletePairs('BAIDU_ACCESS_KEY_ID', 'BAIDU_SECRET_KEY', env),
    // New API 也必须进来：只配站点地址、忘了配令牌时，这张卡是**整个消失**的
    // （`readKeyPairs` 遇到不成对就整对丢弃），页面上既没有错误也没有空状态，
    // 用户能看到的只有「少了一张卡」。实测本机就因为变量改过名而踩过一次。
    ...readIncompletePairs('NEWAPI_BASE_URL', 'NEWAPI_TOKEN', env),
  ]

  // ---------------------------------------------------------------------------
  // API handlers
  // ---------------------------------------------------------------------------

  function handleStatus(): Response {
    // 套餐类（Kimi / MiniMax / OpenCode Go）单独统计，与前端「套餐订阅」Tab 的归属一致
    const plansKeyHints = [...KIMI_KEYS, ...MINIMAX_KEYS, ...OPENCODE_GO_KEYS].map(maskKey)
    return json({
      providers: {
        deepseek: providerStatus(DEEPSEEK_KEYS.map(maskKey)),
        volc: providerStatus(volcCredentialsList.map((cred) => maskKey(cred.accessKey))),
        zhipu: providerStatus(ZHIPU_KEYS.map(maskKey)),
        aliyun: providerStatus(aliyunCredentialsList.map((cred) => maskKey(cred.accessKey))),
        gitee: providerStatus(GITEE_AI_KEYS.map(maskKey)),
        baidu: providerStatus(baiduCredentialsList.map((cred) => maskKey(cred.accessKey))),
        tokenplan: providerStatus(aliyunTokenPlanSources.map((source) => source.keyHint)),
        plans: providerStatus(plansKeyHints),
        newapi: providerStatus(NEWAPI_PAIRS.map((pair) => maskKey(pair.key))),
      },
      incomplete: INCOMPLETE_VARS,
      // 站点自定义随状态一并下发：前端首屏只发一次 /api/status 就能拿到品牌与刷新节奏
      site: SITE_CONFIG,
      now: Date.now(),
    })
  }

  /**
   * 套餐类扩展平台（套餐订阅 Tab 的「订阅套餐」区块）。
   *
   * 与余额类平台分属不同 Tab、不同数据语义：这里是按窗口计的**订阅额度**，
   * 与火山 Agent Plan / Coding Plan、智谱 Coding Plan、百炼 Token Plan 同类。
   */
  async function plansPayload(): Promise<{
    plans: Array<{ provider: string; accounts: unknown[] }>
    configured: number
  }> {
    const planGroups: Array<{ provider: string; entries: AccountEntry<TokenPlanInfo>[] }> = [
      {
        provider: 'Kimi For Coding',
        entries: KIMI_KEYS.map((key) => ({
          keyHint: maskKey(key),
          label: labelOf('kimi', key),
          run: () => fetchKimiPlan(key),
        })),
      },
      {
        provider: 'MiniMax',
        entries: MINIMAX_KEYS.map((key) => ({
          keyHint: maskKey(key),
          label: labelOf('minimax', key),
          run: () => fetchMiniMaxPlan(key),
        })),
      },
      {
        provider: 'OpenCode Go',
        entries: OPENCODE_GO_KEYS.map((key) => ({
          keyHint: maskKey(key),
          label: labelOf('opencode', key),
          run: () => fetchOpenCodeGoUsage(key),
        })),
      },
    ].filter((group) => group.entries.length > 0)

    const planGroupsResult = await Promise.all(
      planGroups.map(async (group) => ({
        provider: group.provider,
        accounts: await runAccounts(group.entries),
      })),
    )

    const configured = planGroups.reduce((sum, group) => sum + group.entries.length, 0)

    return { plans: planGroupsResult, configured }
  }

  async function giteePayload(): Promise<{ accounts: unknown[] }> {
    if (GITEE_AI_KEYS.length === 0) {
      throw new NotConfiguredError('未配置 GITEE_AI_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      GITEE_AI_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        label: labelOf('gitee', apiKey),
        run: async () => {
          // 代金券与资源包并行查询、独立容错：Cookie 未配置 → voucher 缺省；过期/失败 → voucher.error
          const cookie = GITEE_AI_COOKIE_BY_KEY.get(apiKey)
          const [balance, voucher] = await Promise.all([
            fetchGiteePackageBalance(apiKey),
            cookie
              ? fetchGiteeVoucher(cookie).then(
                  (data) => ({ data }),
                  (cause: unknown) => ({
                    error: cause instanceof Error ? cause.message : String(cause),
                  }),
                )
              : Promise.resolve(undefined),
          ])
          return Object.assign({}, balance, { voucher })
        },
      })),
    )
    return { accounts }
  }

  async function deepseekPayload(): Promise<{ accounts: unknown[] }> {
    if (DEEPSEEK_KEYS.length === 0) {
      throw new NotConfiguredError('未配置 DEEPSEEK_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      DEEPSEEK_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        label: labelOf('deepseek', apiKey),
        run: () => fetchDeepSeekBalance(apiKey),
      })),
    )
    return { accounts }
  }

  /**
   * New API（自托管订阅网关）：站点地址 + **系统访问令牌**成对配置，逐站点独立容错。
   *
   * 令牌在站点「个人设置 → 安全设置 → 系统访问令牌」生成；误填 `sk-` 密钥时会自动
   * 退化到账单接口（见 server/newapi.ts 的说明）。
   */
  async function newApiPayload(): Promise<{ accounts: unknown[] }> {
    if (NEWAPI_PAIRS.length === 0) {
      throw new NotConfiguredError('未配置 NEWAPI_BASE_URL / NEWAPI_TOKEN 环境变量')
    }
    const accounts = await runAccounts(
      NEWAPI_PAIRS.map((pair): AccountEntry<NewApiAccountData> => {
        const baseUrl = pair.key
        const userId = NEWAPI_USER_ID_BY_URL.get(baseUrl)
        return {
          keyHint: maskKey(pair.secret),
          label: labelOf('newapi', baseUrl),
          run: () =>
            fetchNewApi({
              baseUrl,
              token: pair.secret,
              ...(userId ? { userId } : {}),
            }),
        }
      }),
    )
    return { accounts }
  }

  async function volcPlanPayload(): Promise<{ accounts: unknown[] }> {
    if (volcCredentialsList.length === 0) {
      throw new NotConfiguredError('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY 环境变量')
    }
    const { start, end } = volcDateRange(String(VOLC_PLAN_DAYS))
    const accounts = await runAccounts(
      volcCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        label: labelOf('volc', creds.accessKey),
        run: async () => {
          const [afp, details, codingPlan, personalPlan] = await Promise.all([
            getAfpUsage(creds),
            getUsageDetails(creds, start, end),
            getCodingPlanUsage(creds),
            // 未订阅时返回 null（不是异常）；GetPersonalPlan 只接受 AgentPlan / CodingPlan
            getPersonalPlan(creds, 'AgentPlan'),
          ])
          return {
            // 档位优先取 GetPersonalPlan（规范大小写的 `Medium`）；
            // GetAFPUsage 的小写 `medium` 只作为它不可用时的回落
            planType: personalPlan?.planType ?? afp.planType,
            personalPlan,
            windows: afp.windows,
            details,
            detailsStart: start,
            detailsEnd: end,
            codingPlan,
          }
        },
      })),
    )
    return { accounts }
  }

  async function zhipuPayload(): Promise<{ accounts: unknown[] }> {
    if (ZHIPU_KEYS.length === 0) {
      throw new NotConfiguredError('未配置 ZHIPU_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      ZHIPU_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        label: labelOf('zhipu', apiKey),
        run: async () => {
          // 三个子查询各自容错：任何一路失败都只降级它自己对应的区块
          const [codingPlan, balance, packages] = await Promise.all([
            subQuerySliceOf(getZhipuCodingPlanQuota(apiKey)),
            subQuerySliceOf(getZhipuAccountBalance(apiKey)),
            subQuerySliceOf(getZhipuTokenPackages(apiKey)),
          ])
          return { codingPlan, balance, packages }
        },
      })),
    )
    return { accounts }
  }

  async function aliyunPayload(): Promise<{ accounts: unknown[] }> {
    if (aliyunCredentialsList.length === 0) {
      throw new NotConfiguredError('未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY 环境变量')
    }
    const accounts = await runAccounts(
      aliyunCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        label: labelOf('aliyun', creds.accessKey),
        run: () => queryResourcePackageInstances(creds),
      })),
    )
    return { accounts }
  }

  async function tokenPlanPayload(): Promise<{ accounts: unknown[] }> {
    if (aliyunTokenPlanSources.length === 0) {
      throw new NotConfiguredError(
        '未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY（组织与座席）或 ALIYUN_TOKENPLAN_COOKIE（个人版用量）环境变量',
      )
    }

    const accounts = await runAccounts(
      aliyunTokenPlanSources.map(({ credentials, cookie, keyHint }) => ({
        keyHint,
        // 别名优先取与 AK/SK 配对的 ALIYUN_LABEL；Cookie 专属账号（无 AK/SK）走
        // ALIYUN_TOKENPLAN_LABEL，否则别名会被静默丢弃
        label:
          labelOf('aliyun', credentials?.accessKey ?? '') ||
          labelOf('tokenplan-cookie', cookie ?? '') ||
          undefined,
        run: async () => {
          const [account, seats, sharedPackages, personal] = await Promise.all([
            // 组织 / 座席 / 共享包依赖 AK/SK；仅有会话 Cookie 时跳过（置 null，展示层隐藏）
            credentials ? getTokenPlanAccount(credentials) : Promise.resolve(null),
            credentials ? getTokenPlanSeats(credentials) : Promise.resolve(null),
            credentials ? getTokenPlanSharedPackages(credentials) : Promise.resolve(null),
            // 个人版用量（独立容错）：组织/座席视图即使无订阅也应正常渲染
            fetchAliyunPersonalPlan({
              ...(cookie ? { cookie } : {}),
              ...(credentials ? { credentials } : {}),
            }).then(
              (data): PersonalSlice => ({ data }),
              (cause: unknown): PersonalSlice => ({
                error: accountErrorHint(
                  cause instanceof Error ? cause.message : String(cause),
                  cause instanceof Error && 'code' in cause ? String(cause.code) : undefined,
                ),
              }),
            ),
          ])
          return { account, seats, sharedPackages, personal }
        },
      })),
    )
    return { accounts }
  }

  async function baiduPayload(): Promise<{ accounts: unknown[] }> {
    if (baiduCredentialsList.length === 0) {
      throw new NotConfiguredError('未配置 BAIDU_ACCESS_KEY_ID / BAIDU_SECRET_KEY 环境变量')
    }
    const accounts = await runAccounts(
      baiduCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        label: labelOf('baidu', creds.accessKey),
        run: () => fetchQianfanData(creds),
      })),
    )
    return { accounts }
  }

  async function openRouterPayload(): Promise<{ accounts: unknown[] }> {
    if (OPENROUTER_KEYS.length === 0) {
      throw new NotConfiguredError('未配置 OPENROUTER_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      OPENROUTER_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        label: labelOf('openrouter', apiKey),
        run: () => fetchOpenRouterDetail(apiKey),
      })),
    )
    return { accounts }
  }

  async function volcInferencePayload(filters: {
    days: string | null
    model?: string
    modelEndpoint?: string
  }): Promise<unknown> {
    if (volcCredentialsList.length === 0) {
      throw new NotConfiguredError('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY 环境变量')
    }
    const { start, end } = volcDateRange(filters.days)

    const apiFilters: Array<{ key: string; values: string[] }> = []
    if (filters.model) {
      apiFilters.push({ key: 'ModelName', values: [filters.model] })
    }
    if (filters.modelEndpoint) {
      apiFilters.push({ key: 'ModelEndpoint', values: [filters.modelEndpoint] })
    }

    const accounts = await runAccounts(
      volcCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        label: labelOf('volc', creds.accessKey),
        run: async () => {
          const usage = await getInferenceUsage(creds, start, end, apiFilters)
          return { rows: usage.rows, start, end }
        },
      })),
    )
    return { accounts }
  }

  /**
   * 火山推理用量：**保留独立端点**。
   *
   * 它是唯一带用户输入的读数接口（`model` / `modelEndpoint` 过滤），并入 `/api/usage`
   * 会让「改一个模型过滤」退化成「全量重拉 10 家平台」—— 反而更贵。
   * 缓存按参数分 key，因此在同一组过滤条件上来回切换不会重复打上游。
   */
  async function handleVolcInference(requestUrl: URL): Promise<Response> {
    const days = requestUrl.searchParams.get('days')
    const model = requestUrl.searchParams.get('model')?.trim() || undefined
    const modelEndpoint = requestUrl.searchParams.get('modelEndpoint')?.trim() || undefined
    const cacheKey = `volc-inference:${days ?? ''}:${model ?? ''}:${modelEndpoint ?? ''}`
    const bypass = requestUrl.searchParams.get('refresh') === '1'
    const result = await usageSliceOf(
      cachedQuery(cacheKey, { ttlSeconds: INFERENCE_TTL_SECONDS, bypass }, () =>
        volcInferencePayload({ days, model, modelEndpoint }),
      ),
    )
    return sliceResponse(result)
  }

  /**
   * `/api/usage` 的 provider 缓存 TTL（秒），按**数据变化节奏**分两档：
   * - `300`：结构与权益类（资源包、套餐、座席）—— 变化以天计；
   * - `60`：余额与用量类 —— 变化以分钟计。
   *
   * 默认刷新间隔 180s，因此按天计的那几项大约每两次自动刷新才真正打一次上游。
   * 手动刷新会绕过缓存（`?refresh=1`，见 cachedQuery 的 bypass）。
   */
  const USAGE_TTL_SECONDS = {
    deepseek: 60,
    volcPlan: 300,
    zhipu: 60,
    aliyun: 300,
    tokenPlan: 300,
    gitee: 60,
    baidu: 300,
    openrouter: 60,
    plans: 300,
    newapi: 60,
  } as const

  type UsageProviderKey = keyof typeof USAGE_TTL_SECONDS

  /**
   * 带缓存地执行一个 provider 查询，并收敛成容错切片。
   *
   * 注意缓存粒度是**整个 provider 的返回**，而 `runAccounts` 会把账号级失败吸收进
   * `accounts` 数组 —— 也就是说「某个账号这次查失败了」也会被缓存住 TTL 秒。
   * 这是可接受的：TTL（60/300s）短于默认自动刷新间隔（180s）的两倍，
   * 且手动刷新走 `bypass` 永远拿实时值；反过来若把账号失败也当成「不该缓存」，
   * 就得让 provider 层感知账号层的成败，容错的两级会被搅在一起。
   */
  function usageProvider<T>(
    key: UsageProviderKey,
    load: () => Promise<T>,
    bypass: boolean,
  ): Promise<UsageSliceResult<T>> {
    return usageSliceOf(
      cachedQuery(`usage:${key}`, { ttlSeconds: USAGE_TTL_SECONDS[key], bypass }, load),
    )
  }

  /**
   * `/api/usage`：把 9 个「每刷新一次、无用户参数、纯读数」的端点合成 1 个。
   *
   * 动机见 issue #23：托管在边缘云上，部分平台按**节点生存时间**计费 ——
   * 端点数直接决定唤醒次数与单次存活时长。合并后每次刷新的前端请求 12 → 2
   * （`/api/status` + `/api/usage`），而**服务端的上游调用数一个不少**，
   * 每个 provider 仍是独立容错切片：一家挂了其余 9 家照常返回。
   *
   * `?refresh=1` 表示手动刷新：跳过缓存读取（但仍复用进行中的同 key 请求），
   * 因此点「刷新」永远拿得到实时数据，而自动刷新走缓存省下上游墙钟。
   */
  async function handleUsage(requestUrl: URL): Promise<Response> {
    const bypass = requestUrl.searchParams.get('refresh') === '1'
    const [deepseek, volcPlan, zhipu, aliyun, tokenPlan, gitee, baidu, openrouter, plans, newapi] =
      await Promise.all([
        usageProvider('deepseek', deepseekPayload, bypass),
        usageProvider('volcPlan', volcPlanPayload, bypass),
        usageProvider('zhipu', zhipuPayload, bypass),
        usageProvider('aliyun', aliyunPayload, bypass),
        usageProvider('tokenPlan', tokenPlanPayload, bypass),
        usageProvider('gitee', giteePayload, bypass),
        usageProvider('baidu', baiduPayload, bypass),
        usageProvider('openrouter', openRouterPayload, bypass),
        usageProvider('plans', plansPayload, bypass),
        usageProvider('newapi', newApiPayload, bypass),
      ])
    return json({
      providers: {
        deepseek,
        volcPlan,
        zhipu,
        aliyun,
        tokenPlan,
        gitee,
        baidu,
        openrouter,
        plans,
        newapi,
      },
      fetchedAt: Date.now(),
    })
  }

  // ---------------------------------------------------------------------------
  // 请求分发：/api/* 返回 API 响应；其余路径返回 null（由宿主处理静态资源）
  //
  // 只有 3 个端点（issue #23 的验收标准）：/api/status（首屏、0 上游调用）、
  // /api/usage（每刷新、9 家平台合并）、/api/volc/inference-usage（带用户输入，按需）。
  // ---------------------------------------------------------------------------

  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/status') {
        return handleStatus()
      }
      if (url.pathname === '/api/usage') {
        return await handleUsage(url)
      }
      if (url.pathname === '/api/volc/inference-usage') {
        return await handleVolcInference(url)
      }
      if (url.pathname.startsWith('/api/')) {
        return errorResponse(404, 'NOT_FOUND', `未知接口: ${url.pathname}`)
      }
      return null
    } catch (error) {
      console.error('[app] %s %s failed:', request.method, logSafe(url.pathname), error)
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}
