/**
 * 多家平台的账户余额查询（实现参考开源项目 CC-Switch src-tauri/services/balance.rs）。
 *
 * - StepFun:      GET https://api.stepfun.com/v1/accounts → { balance }（CNY）
 * - SiliconFlow:  GET https://api.siliconflow.cn/v1/user/info → { data.totalBalance }（CNY）
 * - OpenRouter:   GET https://openrouter.ai/api/v1/credits → { data: { total_credits, total_usage } }（USD）
 * - Novita AI:    GET https://api.novita.ai/v3/user/balance → { availableBalance }（单位 0.0001 USD）
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

/** StepFun：GET /v1/accounts → balance（CNY）。 */
export async function fetchStepFunBalance(apiKey: string): Promise<BalanceInfo> {
  return parseStepFunBalance(
    await balanceGet('https://api.stepfun.com/v1/accounts', apiKey, 'StepFun'),
  )
}

const StepFunBody = z.object({ balance: z.coerce.number().catch(0) })

export function parseStepFunBalance(body: unknown): BalanceInfo {
  return {
    provider: 'StepFun 阶跃星辰',
    balance: safeParse(StepFunBody, body).balance,
    unit: 'CNY',
  }
}

/** 解析失败 → 域错误（避免裸 ZodError 直接暴露给 UI）。 */
function safeParse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new BalanceApiError('InvalidResponse', '响应结构无法解析')
  }
  return parsed.data
}

/** SiliconFlow：GET /v1/user/info → data.totalBalance（CNY）。 */
export async function fetchSiliconFlowBalance(apiKey: string): Promise<BalanceInfo> {
  return parseSiliconFlowBalance(
    await balanceGet('https://api.siliconflow.cn/v1/user/info', apiKey, 'SiliconFlow'),
  )
}

const SiliconFlowBody = z.object({
  data: z.object({ totalBalance: z.coerce.number().catch(0) }).catch({ totalBalance: 0 }),
})

export function parseSiliconFlowBalance(body: unknown): BalanceInfo {
  return {
    provider: 'SiliconFlow 硅基流动',
    balance: safeParse(SiliconFlowBody, body).data.totalBalance,
    unit: 'CNY',
  }
}

/** OpenRouter：GET /api/v1/credits → data.total_credits - total_usage（USD）。 */
export async function fetchOpenRouterBalance(apiKey: string): Promise<BalanceInfo> {
  return parseOpenRouterBalance(
    await balanceGet('https://openrouter.ai/api/v1/credits', apiKey, 'OpenRouter'),
  )
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

export function parseOpenRouterBalance(body: unknown): BalanceInfo {
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

/** Novita AI：GET /v3/user/balance → availableBalance，单位 0.0001 USD。 */
export async function fetchNovitaBalance(apiKey: string): Promise<BalanceInfo> {
  return parseNovitaBalance(
    await balanceGet('https://api.novita.ai/v3/user/balance', apiKey, 'Novita'),
  )
}

const NovitaBody = z.object({ availableBalance: z.coerce.number().catch(0) })

export function parseNovitaBalance(body: unknown): BalanceInfo {
  return {
    provider: 'Novita AI',
    balance: safeParse(NovitaBody, body).availableBalance / 10000,
    unit: 'USD',
    note: '金额单位 0.0001 USD，已换算',
  }
}
