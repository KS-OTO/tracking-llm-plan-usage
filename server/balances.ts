/**
 * 账户余额查询（实现参考开源项目 CC-Switch src-tauri/services/balance.rs）。
 *
 * - OpenRouter: `GET https://openrouter.ai/api/v1/credits` + `/api/v1/key`（USD）
 * - StepFun:    `GET https://api.stepfun.com/v1/accounts`（CNY）
 * - SiliconFlow:`GET https://api.siliconflow.{cn,com}/v1/user/info`（CNY / USD）
 * - Novita AI:  `GET https://api.novita.ai/v3/user/balance`（金额单位 0.0001 USD）
 *
 * 字段口径对齐 CC-Switch 的 `UsageData`：`remaining`（余额）/ `total`（总额）/
 * `used`（已用）/ `unit`（币种）。上游额外给出的现金 / 赠金 / 信用额度等维度
 * 放在 `details`，由前端详情弹窗展示，避免卡面被次要读数挤满。
 */
import { z } from 'zod'

export class BalanceApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface BalanceInfo {
  provider: string
  balance: number
  total?: number
  used?: number
  unit: string
  note?: string
}

/** 详情弹窗里的补充货币读数。 */
export interface BalanceDetail {
  key: string
  label: string
  value: number
  unit: string
}

/** 通用余额视图：StepFun / SiliconFlow / Novita AI / Sub2API 共用。 */
export interface SimpleBalanceInfo {
  provider: string
  /** 订阅型网关可能只回套餐名（不限量），没有可展示的数字余额。 */
  balance: number | null
  total?: number
  used?: number
  unit: string
  note?: string
  /** 套餐名（Sub2API 等订阅型网关会返回）。 */
  plan?: string
  details?: BalanceDetail[]
  meta?: Array<{ label: string; value: string }>
}

/** 通用错误信封：各平台非 2xx 时的常见错误结构。 */
const ErrorEnvelope = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  message: z.string().optional(),
  msg: z.string().optional(),
})

/** 统一超时：与 CC-Switch 的 15s 对齐，避免一段悬挂连接拖住整轮刷新。 */
const REQUEST_TIMEOUT_MS = 15_000

/** 非 2xx 的人类可读原因；鉴权失败单独给明确文案。 */
function httpErrorMessage(provider: string, status: number, detail: string): string {
  if (status === 401) {
    return `${provider} API Key 无效或已失效（HTTP 401）${detail ? `：${detail}` : ''}`
  }
  if (status === 403) {
    return `${provider} 无权限或未开通该服务（HTTP 403）${detail ? `：${detail}` : ''}`
  }
  return `${provider} 请求失败（HTTP ${status}）${detail ? `：${detail}` : ''}`
}

async function balanceGet(url: string, apiKey: string, provider: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new BalanceApiError('NetworkError', `${provider} 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BalanceApiError(
      'InvalidResponse',
      `${provider} 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(json)
    const error = envelope.success ? envelope.data.error : undefined
    const detail =
      error?.message ??
      (envelope.success ? (envelope.data.message ?? envelope.data.msg) : undefined) ??
      text.slice(0, 200)
    throw new BalanceApiError(
      `${provider}_${error?.code ?? `HTTP_${res.status}`}`,
      httpErrorMessage(provider, res.status, detail),
    )
  }
  return json
}

/** 解析失败 → 域错误（避免裸 ZodError 直接暴露给 UI）。 */
function safeParse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new BalanceApiError('InvalidResponse', '响应结构无法解析')
  }
  return parsed.data
}

/** OpenRouter 详细信息（credits + key 元数据合并）。 */
export interface OpenRouterDetail extends BalanceInfo {
  isFreeTier: boolean
  isManagementKey: boolean
  label: string
  /** key 限额（未设置时为 null）。 */
  limit: number | null
  /** 限额剩余额度（未设置时为 null）。 */
  limitRemaining: number | null
  /** 限额重置周期描述（monthly 等，未设置时为 null）。 */
  limitReset: string | null
  /** key 到期时间（ISO，未设置时为 null）。 */
  expiresAt: string | null
  usageDaily: number
  usageWeekly: number
  usageMonthly: number
}

const OpenRouterKeyData = z.object({
  label: z.string().catch(''),
  is_free_tier: z.boolean().catch(false),
  is_management_key: z.boolean().catch(false),
  limit: z.coerce.number().nullish().catch(null),
  limit_remaining: z.coerce.number().nullish().catch(null),
  limit_reset: z.string().nullish().catch(null),
  expires_at: z.string().nullish().catch(null),
  usage: z.coerce.number().catch(0),
  usage_daily: z.coerce.number().catch(0),
  usage_weekly: z.coerce.number().catch(0),
  usage_monthly: z.coerce.number().catch(0),
})

const OpenRouterKeyBody = z.object({ data: OpenRouterKeyData })

/** OpenRouter：credits + key 两路并行合并为完整账户视图。 */
export async function fetchOpenRouterDetail(apiKey: string): Promise<OpenRouterDetail> {
  const [creditsJson, keyJson] = await Promise.all([
    balanceGet('https://openrouter.ai/api/v1/credits', apiKey, 'OpenRouter'),
    balanceGet('https://openrouter.ai/api/v1/key', apiKey, 'OpenRouter'),
  ])
  return parseOpenRouterDetail(creditsJson, keyJson)
}

/** 纯函数：两段响应 → 完整视图（供单测直接消费）。 */
export function parseOpenRouterDetail(creditsJson: unknown, keyJson: unknown): OpenRouterDetail {
  const base = parseOpenRouterBalance(creditsJson)
  const keyParsed = OpenRouterKeyBody.safeParse(keyJson)
  const key = keyParsed.success ? keyParsed.data.data : undefined
  return {
    ...base,
    label: key?.label ?? '',
    isFreeTier: key?.is_free_tier ?? false,
    isManagementKey: key?.is_management_key ?? false,
    limit: key?.limit ?? null,
    limitRemaining: key?.limit_remaining ?? null,
    limitReset: key?.limit_reset ?? null,
    expiresAt: key?.expires_at ?? null,
    usageDaily: key?.usage_daily ?? 0,
    usageWeekly: key?.usage_weekly ?? 0,
    usageMonthly: key?.usage_monthly ?? 0,
  }
}

const OpenRouterData = z.object({
  total_credits: z.coerce.number().catch(0),
  total_usage: z.coerce.number().catch(0),
})
const OpenRouterBody = z.union([
  z.object({ data: OpenRouterData }),
  // 部分错误/兼容形态把字段直接放在顶层
  OpenRouterData,
])

/**
 * 响应长得像不像 credits（只看字段在不在，不看类型）。
 *
 * 字段级容错（每个字段 `.catch(0)`）让 `OpenRouterBody` **永不失败** ——
 * 少了这道闸，任何合法 JSON（包括 `{"nope":true}`）都会被解析成「余额 0.00」，
 * 用户看到的是「账户被清零」而不是「这份响应不认识」。
 * 因此把「像不像 credits」与「个别字段缺不缺」分成两层：前者拒绝，后者兜底。
 * 上游两个字段始终同时返回，所以这道闸不会误杀。
 */
function looksLikeCredits(body: unknown): boolean {
  const AnyRecord = z.record(z.string(), z.unknown())
  const flat = AnyRecord.safeParse(body)
  if (!flat.success) {
    return false
  }
  if ('total_credits' in flat.data || 'total_usage' in flat.data) {
    return true
  }
  // 兼容形态：字段包在 `data` 里
  const nested = AnyRecord.safeParse(flat.data.data)
  return nested.success && ('total_credits' in nested.data || 'total_usage' in nested.data)
}

export function parseOpenRouterBalance(body: unknown): BalanceInfo {
  if (!looksLikeCredits(body)) {
    throw new BalanceApiError('InvalidResponse', '响应结构无法解析')
  }
  const parsed = safeParse(OpenRouterBody, body)
  const data = 'data' in parsed ? parsed.data : parsed
  const total = data.total_credits
  const used = data.total_usage
  return {
    provider: 'OpenRouter',
    balance: total - used,
    total,
    used,
    unit: 'USD',
  }
}

// ---------------------------------------------------------------------------
// StepFun
// ---------------------------------------------------------------------------

const StepFunBody = z.object({
  balance: z.coerce.number().nullish(),
  total_cash_balance: z.coerce.number().nullish(),
  total_voucher_balance: z.coerce.number().nullish(),
})

/**
 * StepFun 余额。上游同时给出总余额、现金余额、代金券余额：
 * 总余额优先，缺失时用现金 + 代金券推导（而不是静默显示 0）。
 */
export function parseStepFunBalance(body: unknown): SimpleBalanceInfo {
  const parsed = safeParse(StepFunBody, body)
  const cash = parsed.total_cash_balance ?? null
  const voucher = parsed.total_voucher_balance ?? null
  const balance =
    parsed.balance ?? (cash !== null || voucher !== null ? (cash ?? 0) + (voucher ?? 0) : null)
  if (balance === null || !Number.isFinite(balance)) {
    throw new BalanceApiError('InvalidResponse', 'StepFun 响应缺少 balance 字段')
  }
  const details: BalanceDetail[] = []
  if (cash !== null) {
    details.push({ key: 'cash', label: '现金余额', value: cash, unit: 'CNY' })
  }
  if (voucher !== null) {
    details.push({ key: 'voucher', label: '代金券余额', value: voucher, unit: 'CNY' })
  }
  return {
    provider: 'StepFun',
    balance,
    unit: 'CNY',
    ...(details.length > 0 ? { details } : {}),
  }
}

export async function fetchStepFunBalance(apiKey: string): Promise<SimpleBalanceInfo> {
  return parseStepFunBalance(
    await balanceGet('https://api.stepfun.com/v1/accounts', apiKey, 'StepFun'),
  )
}

// ---------------------------------------------------------------------------
// SiliconFlow
// ---------------------------------------------------------------------------

export type SiliconFlowSite = 'cn' | 'global'

const SiliconFlowBody = z.object({
  code: z.coerce.number().nullish(),
  message: z.string().nullish(),
  status: z.boolean().nullish(),
  data: z
    .object({
      totalBalance: z.coerce.number().nullish(),
      balance: z.coerce.number().nullish(),
      chargeBalance: z.coerce.number().nullish(),
      status: z.string().nullish(),
    })
    .nullish(),
})

/** 站点取值归一化；非法值给明确错误而不是悄悄打到国内站。 */
export function normalizeSiliconFlowSite(value: string | undefined): SiliconFlowSite {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'cn' || normalized === 'china') {
    return 'cn'
  }
  if (normalized === 'global' || normalized === 'en' || normalized === 'com') {
    return 'global'
  }
  throw new BalanceApiError('InvalidConfig', 'SILICONFLOW_SITE 只能是 cn 或 global')
}

export function siliconFlowBaseUrl(site: SiliconFlowSite): string {
  return site === 'cn' ? 'https://api.siliconflow.cn' : 'https://api.siliconflow.com'
}

/** SiliconFlow 余额：总余额为主，赠费 / 充值余额进详情。 */
export function parseSiliconFlowBalance(body: unknown, site: SiliconFlowSite): SimpleBalanceInfo {
  const parsed = safeParse(SiliconFlowBody, body)
  const data = parsed.data
  if (!data) {
    throw new BalanceApiError('InvalidResponse', 'SiliconFlow 响应缺少 data 字段')
  }
  const total = data.totalBalance ?? null
  const recharge = data.balance ?? null
  const granted = data.chargeBalance ?? null
  const balance =
    total ?? (recharge !== null || granted !== null ? (recharge ?? 0) + (granted ?? 0) : null)
  if (balance === null || !Number.isFinite(balance)) {
    throw new BalanceApiError('InvalidResponse', 'SiliconFlow 响应缺少 totalBalance 字段')
  }
  const unit = site === 'cn' ? 'CNY' : 'USD'
  const details: BalanceDetail[] = []
  if (recharge !== null) {
    details.push({ key: 'recharge', label: '充值余额', value: recharge, unit })
  }
  if (granted !== null) {
    details.push({ key: 'granted', label: '赠费余额', value: granted, unit })
  }
  return {
    provider: site === 'cn' ? 'SiliconFlow' : 'SiliconFlow（国际站）',
    balance,
    unit,
    ...(data.status ? { meta: [{ label: '账户状态', value: data.status }] } : {}),
    ...(details.length > 0 ? { details } : {}),
  }
}

export async function fetchSiliconFlowBalance(
  apiKey: string,
  site: SiliconFlowSite,
): Promise<SimpleBalanceInfo> {
  const provider = site === 'cn' ? 'SiliconFlow' : 'SiliconFlow（国际站）'
  return parseSiliconFlowBalance(
    await balanceGet(`${siliconFlowBaseUrl(site)}/v1/user/info`, apiKey, provider),
    site,
  )
}

// ---------------------------------------------------------------------------
// Novita AI
// ---------------------------------------------------------------------------

const NovitaBody = z.object({
  availableBalance: z.coerce.number().nullish(),
  cashBalance: z.coerce.number().nullish(),
  creditLimit: z.coerce.number().nullish(),
  outstandingInvoices: z.coerce.number().nullish(),
})

/** Novita 金额单位是 0.0001 USD（CC-Switch 同一口径）。 */
function novitaToUsd(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value / 10_000
}

/** Novita 金额单位是 0.0001 USD（CC-Switch 同一口径），统一折算成 USD。 */
export function parseNovitaBalance(body: unknown): SimpleBalanceInfo {
  const parsed = safeParse(NovitaBody, body)
  if (parsed.availableBalance === null || parsed.availableBalance === undefined) {
    throw new BalanceApiError('InvalidResponse', 'Novita AI 响应缺少 availableBalance 字段')
  }
  const balance = novitaToUsd(parsed.availableBalance)
  if (balance === null) {
    throw new BalanceApiError('InvalidResponse', 'Novita AI 余额不是有效数字')
  }
  const cash = novitaToUsd(parsed.cashBalance)
  const credit = novitaToUsd(parsed.creditLimit)
  const outstanding = novitaToUsd(parsed.outstandingInvoices)
  const details: BalanceDetail[] = []
  if (cash !== null) {
    details.push({ key: 'cash', label: '现金余额', value: cash, unit: 'USD' })
  }
  if (credit !== null) {
    details.push({ key: 'credit', label: '信用额度', value: credit, unit: 'USD' })
  }
  if (outstanding !== null) {
    details.push({ key: 'outstanding', label: '待付账单', value: outstanding, unit: 'USD' })
  }
  return {
    provider: 'Novita AI',
    balance,
    unit: 'USD',
    ...(details.length > 0 ? { details } : {}),
  }
}

export async function fetchNovitaBalance(apiKey: string): Promise<SimpleBalanceInfo> {
  return parseNovitaBalance(
    await balanceGet('https://api.novita.ai/v3/user/balance', apiKey, 'Novita AI'),
  )
}
