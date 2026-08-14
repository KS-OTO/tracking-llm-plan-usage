/**
 * 多家平台的账户余额查询（实现参考开源项目 CC-Switch src-tauri/services/balance.rs）。
 *
 * - StepFun:      GET https://api.stepfun.com/v1/accounts → { balance }（CNY）
 * - SiliconFlow:  GET https://api.siliconflow.cn/v1/user/info → { data.totalBalance }（CNY）
 * - OpenRouter:   GET https://openrouter.ai/api/v1/credits → { data: { total_credits, total_usage } }（USD）
 * - Novita AI:    GET https://api.novita.ai/v3/user/balance → { availableBalance }（单位 0.0001 USD）
 */

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

async function balanceGet(
  url: string,
  apiKey: string,
  provider: string,
): Promise<Record<string, unknown>> {
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
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new BalanceApiError(
      'InvalidResponse',
      `${provider} 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  const body = json as Record<string, unknown>
  if (!res.ok) {
    const error = body.error
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : `HTTP_${res.status}`
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : text.slice(0, 200)
    throw new BalanceApiError(`${provider}_${code}`, message)
  }
  return body
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0
}

/** StepFun：GET /v1/accounts → balance（CNY）。 */
export async function fetchStepFunBalance(apiKey: string): Promise<BalanceInfo> {
  const body = await balanceGet('https://api.stepfun.com/v1/accounts', apiKey, 'StepFun')
  return parseStepFunBalance(body)
}

export function parseStepFunBalance(body: Record<string, unknown>): BalanceInfo {
  return {
    provider: 'StepFun 阶跃星辰',
    balance: toNumber(body.balance),
    unit: 'CNY',
  }
}

/** SiliconFlow：GET /v1/user/info → data.totalBalance（CNY）。 */
export async function fetchSiliconFlowBalance(apiKey: string): Promise<BalanceInfo> {
  const body = await balanceGet('https://api.siliconflow.cn/v1/user/info', apiKey, 'SiliconFlow')
  return parseSiliconFlowBalance(body)
}

export function parseSiliconFlowBalance(body: Record<string, unknown>): BalanceInfo {
  const data =
    body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : null
  return {
    provider: 'SiliconFlow 硅基流动',
    balance: toNumber(data?.totalBalance),
    unit: 'CNY',
  }
}

/** OpenRouter：GET /api/v1/credits → data.total_credits - total_usage（USD）。 */
export async function fetchOpenRouterBalance(apiKey: string): Promise<BalanceInfo> {
  const body = await balanceGet('https://openrouter.ai/api/v1/credits', apiKey, 'OpenRouter')
  return parseOpenRouterBalance(body)
}

export function parseOpenRouterBalance(body: Record<string, unknown>): BalanceInfo {
  const data =
    body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : body
  const total = toNumber(data.total_credits)
  const used = toNumber(data.total_usage)
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
  const body = await balanceGet('https://api.novita.ai/v3/user/balance', apiKey, 'Novita')
  return parseNovitaBalance(body)
}

export function parseNovitaBalance(body: Record<string, unknown>): BalanceInfo {
  return {
    provider: 'Novita AI',
    balance: toNumber(body.availableBalance) / 10000,
    unit: 'USD',
    note: '金额单位 0.0001 USD，已换算',
  }
}
