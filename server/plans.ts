/**
 * Kimi / MiniMax Token Plan（Coding Plan 套餐）额度查询。
 * 实现参考开源项目 CC-Switch src-tauri/services/coding_plan.rs。
 *
 * - Kimi For Coding:  GET https://api.kimi.com/coding/v1/usages（Bearer）
 *     limits[].detail{limit,remaining,resetTime} → 5 小时窗口
 *     usage{limit,remaining,resetTime}           → 每周窗口
 * - MiniMax: GET https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains（Bearer）
 *     model_remains[] 中 model_name=="general"：
 *     current_interval_remaining_percent + end_time（5h 桶）
 *     current_weekly_status==1 时 current_weekly_remaining_percent + weekly_end_time（周桶）
 */

export class PlanApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface TokenPlanWindow {
  window: 'fiveHour' | 'weekly'
  percent: number
  resetTime: number
}

export interface TokenPlanInfo {
  provider: string
  windows: TokenPlanWindow[]
}

async function planGet(
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
    throw new PlanApiError('NetworkError', `${provider} 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new PlanApiError(
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
    throw new PlanApiError(`${provider}_${code}`, message)
  }
  return body
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0
}

function utilization(limit: number, remaining: number): number {
  if (limit <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100))
}

/** Kimi For Coding Token Plan。 */
export async function fetchKimiPlan(apiKey: string): Promise<TokenPlanInfo> {
  const body = await planGet('https://api.kimi.com/coding/v1/usages', apiKey, 'Kimi')
  return parseKimiPlan(body)
}

export function parseKimiPlan(body: Record<string, unknown>): TokenPlanInfo {
  const windows: TokenPlanWindow[] = []

  const limits = Array.isArray(body.limits) ? (body.limits as Array<Record<string, unknown>>) : []
  for (const limitItem of limits) {
    const detail =
      limitItem.detail && typeof limitItem.detail === 'object'
        ? (limitItem.detail as Record<string, unknown>)
        : null
    if (!detail) {
      continue
    }
    const limit = toNumber(detail.limit)
    const remaining = toNumber(detail.remaining)
    windows.push({
      window: 'fiveHour',
      percent: utilization(limit, remaining),
      resetTime: Number(detail.resetTime ?? 0),
    })
  }

  const usage =
    body.usage && typeof body.usage === 'object' ? (body.usage as Record<string, unknown>) : null
  if (usage) {
    const limit = toNumber(usage.limit)
    const remaining = toNumber(usage.remaining)
    windows.push({
      window: 'weekly',
      percent: utilization(limit, remaining),
      resetTime: Number(usage.resetTime ?? 0),
    })
  }

  return { provider: 'Kimi For Coding', windows }
}

/** MiniMax Token Plan。 */
export async function fetchMiniMaxPlan(apiKey: string): Promise<TokenPlanInfo> {
  const body = await planGet(
    'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
    apiKey,
    'MiniMax',
  )
  return parseMiniMaxPlan(body)
}

export function parseMiniMaxPlan(body: Record<string, unknown>): TokenPlanInfo {
  const baseResp =
    body.base_resp && typeof body.base_resp === 'object'
      ? (body.base_resp as Record<string, unknown>)
      : null
  if (baseResp && toNumber(baseResp.status_code) !== 0) {
    const statusMessage = typeof baseResp.status_msg === 'string' ? baseResp.status_msg : ''
    throw new PlanApiError('MiniMax_BUSINESS', `MiniMax 返回错误: ${statusMessage}`)
  }

  const windows: TokenPlanWindow[] = []
  const modelRemains = Array.isArray(body.model_remains)
    ? (body.model_remains as Array<Record<string, unknown>>)
    : []
  const general = modelRemains.find((item) => item.model_name === 'general')

  if (general) {
    const fiveHourRemainPct = toNumber(general.current_interval_remaining_percent)
    if (fiveHourRemainPct > 0 || 'current_interval_remaining_percent' in general) {
      windows.push({
        window: 'fiveHour',
        percent: Math.max(0, 100 - fiveHourRemainPct),
        resetTime: Number(general.end_time ?? 0),
      })
    }
    if (toNumber(general.current_weekly_status) === 1) {
      const weeklyRemainPct = toNumber(general.current_weekly_remaining_percent)
      windows.push({
        window: 'weekly',
        percent: Math.max(0, 100 - weeklyRemainPct),
        resetTime: Number(general.weekly_end_time ?? 0),
      })
    }
  }

  return { provider: 'MiniMax', windows }
}
