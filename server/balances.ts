/**
 * OpenRouter 账户余额与密钥元数据（实现参考开源项目 CC-Switch src-tauri/services/balance.rs）。
 *
 * - `GET https://openrouter.ai/api/v1/credits` → { data: { total_credits, total_usage } }（USD）
 * - `GET https://openrouter.ai/api/v1/key`     → { data: { label, limit, usage_* } }
 *
 * 这里**曾**同时支持 StepFun / SiliconFlow / Novita 三家余额，但它们的唯一入口是
 * 已废弃的 `/api/extras`（前端从未调用），因此随该端点一并移除（issue #23）。
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

/** 通用错误信封：各平台非 2xx 时的常见错误结构。 */
const ErrorEnvelope = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
})

async function balanceGet(url: string, apiKey: string, provider: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
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
    throw new BalanceApiError(
      `${provider}_${error?.code ?? `HTTP_${res.status}`}`,
      error?.message ?? text.slice(0, 200),
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
