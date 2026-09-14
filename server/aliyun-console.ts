/**
 * 阿里云百炼 Token Plan **个人版** 用量查询。
 *
 * 两条通道（Cookie 优先，AK/SK 兜底）：
 *
 * ① **控制台会话 Cookie**（推荐，2026-09-14 以真实账号抓包核实可用）——
 *    bailian.console.aliyun.com 页面自身的调用方式：
 *      POST https://bailian-cs.console.aliyun.com/data/api.json
 *           ?action=BroadScopeAspnGateway&product=sfm_bailian&api=<api>&_v=
 *      body: params=<JSON>&region=cn-beijing，鉴权仅靠 Cookie。
 *    实测**只需 `login_aliyunid_ticket` 一个 Cookie**（其余 Cookie、Origin、Referer 均非必需），
 *    无需 AK/SK、无需任何 RAM 授权。
 *
 * ② **AK/SK**（需 RAM 权限 `modelstudio:GenerateCLIAccessToken`）——官方 CLI
 *    （`bl usage token-plan`）的路径：
 *      ① ACS3-HMAC-SHA256 调 GenerateCLIAccessToken 换 cliAccessToken；
 *      ② 以 Bearer 该 token 调 /cli/api.json 网关。
 *    本模块是它的**平台无关原生移植**（Web Crypto，无子进程），Bun / Workers 均可运行。
 *
 * 背景：官方文档公布的 `GET https://dashscope.aliyuncs.com/api/v1/tokenplan/*`
 * （Bearer API Key）目前**未在网关注册** —— 实测带/不带 Bearer 一律 Istio 空体 404，
 * 而同网关真实路由（/api/v1/tasks/*）返回 401，即路由缺失而非鉴权失败。
 * 故两条通道均不依赖该系列接口。
 *
 * 数据语义（真实账号抓包核实）：
 * - usage            → `per1WeekPercentage` 是 **0-1 比值**（实测 0.2750906925 ⇒ 27.50906925%），
 *                      官方 CLI 与社区参考实现均按 ×100 展示；`per5Hour*` 官方已下线，
 *                      两个字段都缺失时置 null（展示层隐藏该窗口）。
 * - subscription     → `{instanceCode, specCode, remainingDays, startTime, endTime, autoRenewFlag, status}`
 * - addon/summary    → `{remainingCredits, totalCredits, activeCount}`
 * - reset-card/list  → `[{cardType, effectiveAt, expiresAt, cardNo}]`（数组负载，非对象）
 *
 * 参考实现：modelstudioai/cli（packages/core/src/console/gateway.ts、
 * packages/core/src/auth/refresh-token.ts）与 1020645823-dev/AliyunTokenBar。
 */
import { z } from 'zod'

import type { AliyunCredentials } from './aliyun.ts'
import { resetTimeToMillis } from './plans.ts'

const MODELSTUDIO_HOST = 'modelstudio.cn-beijing.aliyuncs.com'
const ACCESS_TOKEN_PATH = '/modelstudio/cli/generateAccessToken'
const ACCESS_TOKEN_ACTION = 'GenerateCLIAccessToken'
const API_VERSION = '2026-02-10'

const CONSOLE_GATEWAY_HOST = 'bailian-cs.console.aliyun.com'
const GATEWAY_ACTION = 'BroadScopeAspnGateway'
const GATEWAY_PRODUCT = 'sfm_bailian'
const CONSOLE_REGION = 'cn-beijing'
/** 控制台页面通道（会话 Cookie 鉴权）。 */
const CONSOLE_DATA_PATH = '/data/api.json'
/** CLI 通道（cliAccessToken Bearer 鉴权）。 */
const CONSOLE_CLI_PATH = '/cli/api.json'

const PERSONAL_API = {
  usage: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage',
  subscription: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription',
  addon: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/addon/summary',
  resetCards: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/reset-card/list',
} as const

/** 订阅详情需要显式带上的商品码（控制台同款请求）。 */
const PERSONAL_COMMODITY_CODE = 'sfm_tokenplansolo_public_cn'

/** 控制台 access token 缓存时长：CLI 侧 token 数日有效，短 TTL 仅用于削峰。 */
const TOKEN_TTL_MS = 10 * 60_000

export class AliyunConsoleApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// ACS3-HMAC-SHA256 签名（Web Crypto，兼容 Bun / Workers）
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', textEncoder.encode(input)))
}

async function hmacSha256Hex(key: string, input: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(input)))
}

export interface Acs3SignOptions {
  accessKeyId: string
  accessKeySecret: string
  securityToken?: string
  action: string
  version: string
  host: string
  pathname: string
  method: string
  body: string
  queryString?: string
  date: string
  nonce: string
}

/**
 * 构造 ACS3-HMAC-SHA256 请求头。
 *
 * CanonicalRequest =
 *   Method \n Pathname \n CanonicalQueryString \n CanonicalHeaders \n
 *   SignedHeaders \n HashedPayload
 * StringToSign = "ACS3-HMAC-SHA256" \n SHA256(CanonicalRequest)
 * Signature = HMAC-SHA256(SecretKey, StringToSign) 的十六进制
 *
 * `date`/`nonce` 由调用方注入以便测试可复现（生产用当前时间与随机 UUID）。
 */
export async function signAcs3(opts: Acs3SignOptions): Promise<Record<string, string>> {
  const hashedBody = await sha256Hex(opts.body)
  const headers: Record<string, string> = {
    host: opts.host,
    'x-acs-action': opts.action,
    'x-acs-version': opts.version,
    'x-acs-date': opts.date,
    'x-acs-signature-nonce': opts.nonce,
    'x-acs-content-sha256': hashedBody,
    'content-type': 'application/json',
  }
  if (opts.securityToken) {
    headers['x-acs-security-token'] = opts.securityToken
  }

  const signedHeaderNames = Object.keys(headers)
    .filter((name) => name === 'host' || name === 'content-type' || name.startsWith('x-acs-'))
    .toSorted()
  const canonicalHeaders = `${signedHeaderNames
    .map((name) => `${name}:${headers[name]}`)
    .join('\n')}\n`
  const signedHeaders = signedHeaderNames.join(';')

  const canonicalRequest = [
    opts.method,
    opts.pathname,
    opts.queryString ?? '',
    canonicalHeaders,
    signedHeaders,
    hashedBody,
  ].join('\n')

  const signature = await hmacSha256Hex(
    opts.accessKeySecret,
    `ACS3-HMAC-SHA256\n${await sha256Hex(canonicalRequest)}`,
  )

  return {
    ...headers,
    authorization: `ACS3-HMAC-SHA256 Credential=${opts.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`,
  }
}

// ---------------------------------------------------------------------------
// ① GenerateCLIAccessToken：AK/SK → cliAccessToken
// ---------------------------------------------------------------------------

const AccessTokenResponse = z.object({
  cliAccessToken: z.string().optional(),
  Code: z.string().optional(),
  Message: z.string().optional(),
  AccessDeniedDetail: z.object({ AuthAction: z.string().optional() }).nullish(),
})

/** 解析 GenerateCLIAccessToken 响应；失败时抛出可读域错误。 */
export async function parseAccessTokenResponse(status: number, text: string): Promise<string> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AliyunConsoleApiError(
      'InvalidResponse',
      `GenerateCLIAccessToken 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  const parsed = AccessTokenResponse.safeParse(json)
  if (!parsed.success) {
    throw new AliyunConsoleApiError(
      'InvalidResponse',
      `GenerateCLIAccessToken 响应结构无法解析: ${text.slice(0, 200)}`,
    )
  }

  const body = parsed.data
  if (status >= 200 && status < 300 && body.cliAccessToken) {
    return body.cliAccessToken
  }

  // 网关/管控面错误：优先取 Code，其次 HTTP 状态
  const code = body.Code ?? `HTTP_${status}`
  const action = body.AccessDeniedDetail?.AuthAction
  const rawMessage =
    body.Message && body.Message.trim() !== ''
      ? body.Message
      : `${code}：响应未提供错误详情 ${text.slice(0, 200)}`

  // RAM 未授权的可读化：用户需要的是「该加哪个权限」而不是英文原文
  if (action || code === 'NoPermission' || code === 'AccessDenied') {
    const missing = action ?? 'modelstudio:GenerateCLIAccessToken'
    throw new AliyunConsoleApiError(
      code,
      `RAM 权限不足：调用 GenerateCLIAccessToken 需要 ${missing}。请在 RAM 策略中补充该 Action，或改用 ALIYUN_TOKENPLAN_COOKIE（控制台会话 Cookie，无需授权）。`,
    )
  }

  throw new AliyunConsoleApiError(code, rawMessage)
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

/** 缓存键只用 AccessKeyId，避免把 SecretKey 留在内存映射里。 */
function cacheKey(creds: AliyunCredentials): string {
  return creds.accessKey
}

export async function generateCliAccessToken(
  creds: AliyunCredentials,
  now: number = Date.now(),
): Promise<string> {
  const cached = tokenCache.get(cacheKey(creds))
  if (cached && cached.expiresAt > now) {
    return cached.token
  }

  const headers = await signAcs3({
    accessKeyId: creds.accessKey,
    accessKeySecret: creds.secretKey,
    action: ACCESS_TOKEN_ACTION,
    version: API_VERSION,
    host: MODELSTUDIO_HOST,
    pathname: ACCESS_TOKEN_PATH,
    method: 'POST',
    body: '',
    date: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    nonce: crypto.randomUUID(),
  })

  let res: Response
  try {
    res = await fetch(`https://${MODELSTUDIO_HOST}${ACCESS_TOKEN_PATH}`, {
      method: 'POST',
      headers,
    })
  } catch (cause) {
    throw new AliyunConsoleApiError(
      'NetworkError',
      `请求 Model Studio GenerateCLIAccessToken 失败: ${String(cause)}`,
    )
  }

  const token = await parseAccessTokenResponse(res.status, await res.text())
  tokenCache.set(cacheKey(creds), { token, expiresAt: now + TOKEN_TTL_MS })
  return token
}

/** 测试辅助：清空 access token 缓存。 */
export function clearAccessTokenCache(): void {
  tokenCache.clear()
}

// ---------------------------------------------------------------------------
// ② 控制台网关：BroadScopeAspnGateway
// ---------------------------------------------------------------------------

/** 网关请求体（与官方 CLI buildGatewayParams 一致）。 */
export function buildGatewayParams(api: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    Api: api,
    V: '1.0',
    Data: {
      ...data,
      cornerstoneParam: {
        protocol: 'V2',
        console: 'ONE_CONSOLE',
        productCode: 'p_efm',
        switchUserType: 3,
        consoleSite: 'BAILIAN_ALIYUN',
      },
    },
  })
}

export interface ConsoleGatewayRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/**
 * 构造控制台网关请求（纯函数，便于对 URL / 表单体 / 鉴权头做断言）。
 *
 * 注意 `api` 参数走 URLSearchParams，`/` 会被编码为 `%2F`；网关服务端正常解码
 * （已对真实网关验证）。`_v` 与页面一致保持空值。
 */
export function buildGatewayRequest(
  path: string,
  api: string,
  data: Record<string, unknown> = {},
  authHeaders: Record<string, string> = {},
): ConsoleGatewayRequest {
  const query = new URLSearchParams({
    action: GATEWAY_ACTION,
    product: GATEWAY_PRODUCT,
    api,
    _v: '',
  })
  const body = new URLSearchParams({
    params: buildGatewayParams(api, data),
    region: CONSOLE_REGION,
  })
  return {
    url: `https://${CONSOLE_GATEWAY_HOST}${path}?${query.toString()}`,
    headers: {
      accept: '*/*',
      'content-type': 'application/x-www-form-urlencoded',
      ...authHeaders,
    },
    body: body.toString(),
  }
}

const DataRecord = z.record(z.string(), z.unknown())

/** 窄化 unknown → 普通对象；非对象（含数组）返回 undefined，不抛错。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = DataRecord.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/**
 * 解包控制台响应信封，返回最内层业务负载（可能是对象，也可能是数组，
 * 如 reset-card/list）。
 *
 * 真实用法返回 `data.DataV2.data.data`；逐层宽松回退：
 * `data.DataV2.data` → `data.data` → 原值。
 */
export function unwrapConsolePayload(result: unknown): unknown {
  const root = asRecord(result)
  if (!root) {
    return result
  }
  const data = asRecord(root.data)
  if (!data) {
    return root
  }
  const dataV2 = asRecord(data.DataV2)
  if (dataV2) {
    // DataV2.data = { msg, code, data, requestId, success }；要的是内层 data
    const inner = asRecord(dataV2.data)
    if (inner && 'data' in inner) {
      return inner.data
    }
    return inner ?? dataV2
  }
  return 'data' in data ? data.data : data
}

const GatewayEnvelope = z.object({
  data: z
    .object({
      success: z.boolean().optional(),
      errorCode: z.string().optional(),
      errorMsg: z.string().optional(),
    })
    .optional(),
})

/**
 * 控制台会话失效的提示（Cookie 过期时最常见的失败原因）。
 * 刻意不含「会话已失效」字样——账号级容错会再拼上 `ConsoleSessionExpired` 的中文提示。
 */
const SESSION_EXPIRED_MESSAGE =
  '请重新登录 bailian.console.aliyun.com，复制新的 login_aliyunid_ticket 到 ALIYUN_TOKENPLAN_COOKIE'

/**
 * 解析控制台网关响应（纯函数）：
 * 非 2xx / 非 JSON / `success === false` 一律抛出可读域错误，成功时返回最内层业务负载。
 *
 * 真实失败体（未登录）：
 *   {"code":"200","data":{"success":false,"errorCode":"BailianGateway.Login.NotLogined",
 *    "errorMsg":"BailianGateway.Login.NotLogined", ...}}
 */
export function parseGatewayResponse(status: number, text: string): unknown {
  if (status < 200 || status >= 300) {
    throw new AliyunConsoleApiError(
      `HTTP_${status}`,
      `控制台网关返回 ${status}: ${text.slice(0, 200)}`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AliyunConsoleApiError(
      'InvalidResponse',
      `控制台网关响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  const envelope = GatewayEnvelope.safeParse(json)
  const inner = envelope.success ? envelope.data.data : undefined
  if (inner?.success === false) {
    const errorCode = inner.errorCode?.trim() || 'UnknownError'
    const notLogined = errorCode.includes('NotLogined')
    throw new AliyunConsoleApiError(
      notLogined ? 'ConsoleSessionExpired' : errorCode,
      notLogined ? SESSION_EXPIRED_MESSAGE : inner.errorMsg?.trim() || errorCode,
    )
  }

  return unwrapConsolePayload(json)
}

async function postConsoleGateway(req: ConsoleGatewayRequest): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
  } catch (cause) {
    throw new AliyunConsoleApiError('NetworkError', `控制台网关请求失败: ${String(cause)}`)
  }

  return parseGatewayResponse(res.status, await res.text())
}

/**
 * Token Plan 控制台调用通道。
 * `kind` 会透出到前端，便于区分「Cookie 会话」与「AK/SK」两种数据来源。
 */
export interface ConsoleTransport {
  readonly kind: 'cookie' | 'cli'
  call(api: string, data?: Record<string, unknown>): Promise<unknown>
}

/**
 * 归一化控制台会话 Cookie（纯函数）。
 *
 * `ALIYUN_TOKENPLAN_COOKIE` 允许两种粘法，两者都很常见：
 * - 从 DevTools 复制的**单个 Cookie 值**（如 `login_aliyunid_ticket` 的值，自身不含 `=`）；
 * - 整段 `Cookie` 请求头（形如 `a=b; c=d`）。
 *
 * 判据：出现 `=` 即视为已带 Cookie 名，原样使用；否则按「裸 ticket 值」补上
 * `login_aliyunid_ticket=` 前缀。实测该 ticket 值本身不含 `=`，不会误判。
 */
export function normalizeSessionCookie(raw: string): string {
  const value = raw.trim()
  if (value === '') {
    return ''
  }
  return value.includes('=') ? value : `login_aliyunid_ticket=${value}`
}

/**
 * 会话失效时的补充说明（纯函数）。
 *
 * 报 `NotLogined` 有两种成因，但网关给出的错误完全一致、无法区分：
 * 1. 会话真过期；
 * 2. 配置值在本地 `.env` 里被 `$VAR` 展开**静默截断**（ticket 值含字面 `$`，
 *    未转义为 `\$` 时会被吃掉若干字符）。
 *
 * 补上实际长度，让用户在报错当下就能自证：与浏览器里复制的值比对，明显偏短即属第 2 种。
 */
export function sessionExpiredHint(normalizedCookie: string): string {
  return `（当前配置值长度 ${normalizedCookie.length}；若明显短于浏览器中复制的值，说明本地 .env 里字面 $ 未转义为 \\$）`
}

/** 控制台会话 Cookie 通道：只需 `login_aliyunid_ticket`。 */
export function createCookieTransport(cookie: string): ConsoleTransport {
  const value = normalizeSessionCookie(cookie)
  if (value === '') {
    throw new AliyunConsoleApiError('InvalidCredentials', 'ALIYUN_TOKENPLAN_COOKIE 为空')
  }
  return {
    kind: 'cookie',
    call: async (api, data = {}) => {
      try {
        return await postConsoleGateway(
          buildGatewayRequest(CONSOLE_DATA_PATH, api, data, { cookie: value }),
        )
      } catch (cause) {
        // 会话失效最常见的原因是「值本身已损坏」，此处补上长度便于用户自证
        if (cause instanceof AliyunConsoleApiError && cause.code === 'ConsoleSessionExpired') {
          throw new AliyunConsoleApiError(
            cause.code,
            `${cause.message}${sessionExpiredHint(value)}`,
          )
        }
        throw cause
      }
    },
  }
}

/** AK/SK 通道：先以 ACS3 签名换取 cliAccessToken，再以 Bearer 调用网关。 */
export async function createCliTransport(creds: AliyunCredentials): Promise<ConsoleTransport> {
  const token = await generateCliAccessToken(creds)
  return {
    kind: 'cli',
    call: (api, data = {}) =>
      postConsoleGateway(
        buildGatewayRequest(CONSOLE_CLI_PATH, api, data, {
          authorization: `Bearer ${token}`,
        }),
      ),
  }
}

export interface AliyunPersonalAuth {
  /** 控制台会话 Cookie（优先；无需 RAM 授权）。 */
  cookie?: string
  /** AK/SK（兜底；需 RAM `modelstudio:GenerateCLIAccessToken`）。 */
  credentials?: AliyunCredentials
}

async function resolveTransport(auth: AliyunPersonalAuth): Promise<ConsoleTransport> {
  if (auth.cookie?.trim()) {
    return createCookieTransport(auth.cookie)
  }
  if (auth.credentials) {
    return createCliTransport(auth.credentials)
  }
  throw new AliyunConsoleApiError(
    'InvalidCredentials',
    '缺少 ALIYUN_TOKENPLAN_COOKIE 或 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY，无法查询个人版用量',
  )
}

// ---------------------------------------------------------------------------
// ③ 个人版套餐数据
// ---------------------------------------------------------------------------

export interface AliyunPersonalWindow {
  /** 已用百分比（0-100）。 */
  percent: number
  resetTime: number
}

export interface AliyunPersonalSubscription {
  instanceCode: string
  specCode: string
  status: string
  remainingDays: number
  startTime: number
  endTime: number
  autoRenewFlag: boolean
}

export interface AliyunPersonalAddon {
  remainingCredits: number
  totalCredits: number
  activeCount: number
}

/** 重置卡：可在有效期内提前重置额度窗口（控制台「重置卡」列表）。 */
export interface AliyunResetCard {
  cardType: string
  effectiveAt: number
  expiresAt: number
}

export interface AliyunPersonalPlan {
  /** 数据来源通道：cookie（会话 Cookie）/ cli（AK/SK）。 */
  source: 'cookie' | 'cli'
  /** 5 小时窗口；官方已下线，两个字段都缺失时为 null（展示层隐藏该窗口）。 */
  fiveHour: AliyunPersonalWindow | null
  weekly: AliyunPersonalWindow
  subscription: AliyunPersonalSubscription | null
  addon: AliyunPersonalAddon | null
  resetCards: AliyunResetCard[]
}

/**
 * 已用百分比：接口返回的是 **0-1 比值**，换算为 0-100 并钳制。
 *
 * 依据：真实抓包 `per1WeekPercentage=0.2750906925`（对应控制台 27.51%），
 * 且官方 CLI 与 AliyunTokenBar 均按 ×100 展示（后者另对 1.5 这类越界值钳到 100）。
 */
export function toUsedPercent(value: unknown): number {
  const num = typeof value === 'string' ? Number(value) : value
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return 0
  }
  return Math.min(100, Math.max(0, num * 100))
}

function toNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'string' ? Number(value) : value
  return typeof num === 'number' && Number.isFinite(num) ? num : fallback
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 解析用量窗口。
 * - 5h 两个字段均缺失 → null（官方取消 5h 窗口后的常态，展示层隐藏该行）；
 *   任一字段存在 → 窗口有效，缺失侧按 0（零用量正常展示）。
 * - 7d 字段缺失 → 按 0（与官方控制台一致，避免整次刷新判失败）。
 */
export function parsePersonalUsage(payload: Record<string, unknown>): {
  fiveHour: AliyunPersonalWindow | null
  weekly: AliyunPersonalWindow
} {
  const hasFiveHour = payload.per5HourPercentage != null
  const hasFiveHourReset = payload.per5HourResetTime != null
  const fiveHour: AliyunPersonalWindow | null =
    hasFiveHour || hasFiveHourReset
      ? {
          percent: toUsedPercent(payload.per5HourPercentage),
          resetTime: resetTimeToMillis(payload.per5HourResetTime),
        }
      : null

  return {
    fiveHour,
    weekly: {
      percent: toUsedPercent(payload.per1WeekPercentage),
      resetTime: resetTimeToMillis(payload.per1WeekResetTime),
    },
  }
}

export function parsePersonalSubscription(
  payload: Record<string, unknown>,
): AliyunPersonalSubscription | null {
  const specCode = toText(payload.specCode)
  const status = toText(payload.status)
  if (specCode === '' || status === '') {
    return null
  }
  return {
    instanceCode: toText(payload.instanceCode),
    specCode,
    status,
    remainingDays: Math.trunc(toNumber(payload.remainingDays)),
    startTime: resetTimeToMillis(payload.startTime),
    endTime: resetTimeToMillis(payload.endTime),
    autoRenewFlag: payload.autoRenewFlag === true,
  }
}

export function parsePersonalAddon(payload: Record<string, unknown>): AliyunPersonalAddon {
  return {
    remainingCredits: toNumber(payload.remainingCredits),
    totalCredits: toNumber(payload.totalCredits),
    activeCount: Math.trunc(toNumber(payload.activeCount)),
  }
}

/** 解析重置卡列表；负载非数组（含网关错误降级）时返回空列表。 */
export function parseResetCards(payload: unknown): AliyunResetCard[] {
  if (!Array.isArray(payload)) {
    return []
  }
  const cards: AliyunResetCard[] = []
  for (const entry of payload) {
    const record = asRecord(entry)
    const cardType = record ? toText(record.cardType) : ''
    if (!record || cardType === '') {
      continue
    }
    cards.push({
      cardType,
      effectiveAt: resetTimeToMillis(record.effectiveAt),
      expiresAt: resetTimeToMillis(record.expiresAt),
    })
  }
  return cards
}

/** 可选对象子查询：网关错误或非对象负载一律降级为 null，不影响主数据。 */
async function optionalRecord<T>(
  request: Promise<unknown>,
  parse: (payload: Record<string, unknown>) => T | null,
): Promise<T | null> {
  try {
    const record = asRecord(await request)
    return record ? parse(record) : null
  } catch {
    return null
  }
}

/**
 * 拉取个人版套餐用量。
 *
 * usage 为必需项（失败即整次失败，由调用方做账号级容错）；
 * subscription / addon / resetCards 为可选项（失败或缺省不阻断用量展示）。
 */
export async function fetchAliyunPersonalPlan(
  auth: AliyunPersonalAuth,
): Promise<AliyunPersonalPlan> {
  const transport = await resolveTransport(auth)

  const [usageRaw, subscription, addon, resetCards] = await Promise.all([
    transport.call(PERSONAL_API.usage),
    optionalRecord(
      transport.call(PERSONAL_API.subscription, {
        queryInstanceInfoRequest: { commodityCode: PERSONAL_COMMODITY_CODE },
      }),
      parsePersonalSubscription,
    ),
    optionalRecord(transport.call(PERSONAL_API.addon), parsePersonalAddon),
    transport.call(PERSONAL_API.resetCards).then(parseResetCards, () => []),
  ])

  const usageRecord = asRecord(usageRaw)
  if (!usageRecord) {
    throw new AliyunConsoleApiError(
      'InvalidResponse',
      `${PERSONAL_API.usage} 响应结构无法解析（期望对象负载）: ${JSON.stringify(usageRaw)?.slice(0, 200)}`,
    )
  }

  const windows = parsePersonalUsage(usageRecord)
  return {
    source: transport.kind,
    fiveHour: windows.fiveHour,
    weekly: windows.weekly,
    subscription,
    addon,
    resetCards,
  }
}

export {
  CONSOLE_GATEWAY_HOST,
  CONSOLE_DATA_PATH,
  CONSOLE_CLI_PATH,
  GATEWAY_ACTION,
  GATEWAY_PRODUCT,
  CONSOLE_REGION,
  PERSONAL_API,
}
