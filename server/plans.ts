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
import { z } from 'zod'

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

const ErrorEnvelope = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
})

async function planGet(url: string, apiKey: string, provider: string): Promise<unknown> {
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
    json = JSON.parse(text)
  } catch {
    throw new PlanApiError(
      'InvalidResponse',
      `${provider} 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(json)
    const error = envelope.success ? envelope.data.error : undefined
    throw new PlanApiError(
      `${provider}_${error?.code ?? `HTTP_${res.status}`}`,
      error?.message ?? text.slice(0, 200),
    )
  }
  return json
}

/** 解析失败 → 域错误（避免裸 ZodError 直接暴露给 UI）。 */
function parsePlanBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new PlanApiError('InvalidResponse', '响应结构无法解析')
  }
  return parsed.data
}

function utilization(limit: number, remaining: number): number {
  if (limit <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100))
}

/** Kimi For Coding Token Plan。 */
export async function fetchKimiPlan(apiKey: string): Promise<TokenPlanInfo> {
  return parseKimiPlan(await planGet('https://api.kimi.com/coding/v1/usages', apiKey, 'Kimi'))
}

const KimiBody = z.object({
  limits: z
    .array(
      z.object({
        detail: z
          .object({
            limit: z.coerce.number().catch(0),
            remaining: z.coerce.number().catch(0),
            resetTime: z.coerce.number().catch(0),
          })
          .nullish(),
      }),
    )
    .catch([]),
  usage: z
    .object({
      limit: z.coerce.number().catch(0),
      remaining: z.coerce.number().catch(0),
      resetTime: z.coerce.number().catch(0),
    })
    .nullish(),
})

export function parseKimiPlan(body: unknown): TokenPlanInfo {
  const windows: TokenPlanWindow[] = []
  const parsed = parsePlanBody(KimiBody, body)

  for (const limitItem of parsed.limits) {
    const detail = limitItem.detail
    if (!detail) {
      continue
    }
    windows.push({
      window: 'fiveHour',
      percent: utilization(detail.limit, detail.remaining),
      resetTime: detail.resetTime,
    })
  }

  if (parsed.usage) {
    windows.push({
      window: 'weekly',
      percent: utilization(parsed.usage.limit, parsed.usage.remaining),
      resetTime: parsed.usage.resetTime,
    })
  }

  return { provider: 'Kimi For Coding', windows }
}

/** MiniMax Token Plan。 */
export async function fetchMiniMaxPlan(apiKey: string): Promise<TokenPlanInfo> {
  return parseMiniMaxPlan(
    await planGet(
      'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
      apiKey,
      'MiniMax',
    ),
  )
}

const MiniMaxBody = z.object({
  base_resp: z
    .object({
      status_code: z.coerce.number().catch(0),
      status_msg: z.string().catch(''),
    })
    .nullish(),
  model_remains: z
    .array(
      z.object({
        model_name: z.string().nullish(),
        current_interval_remaining_percent: z.coerce.number().optional(),
        current_weekly_status: z.coerce.number().catch(0),
        current_weekly_remaining_percent: z.coerce.number().catch(0),
        end_time: z.coerce.number().catch(0),
        weekly_end_time: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
})

export function parseMiniMaxPlan(body: unknown): TokenPlanInfo {
  const parsed = parsePlanBody(MiniMaxBody, body)

  if (parsed.base_resp && parsed.base_resp.status_code !== 0) {
    throw new PlanApiError('MiniMax_BUSINESS', `MiniMax 返回错误: ${parsed.base_resp.status_msg}`)
  }

  const windows: TokenPlanWindow[] = []
  const general = parsed.model_remains.find((item) => item.model_name === 'general')

  if (general) {
    const fiveHourRemainPct = general.current_interval_remaining_percent ?? 0
    if (fiveHourRemainPct > 0 || general.current_interval_remaining_percent !== undefined) {
      windows.push({
        window: 'fiveHour',
        percent: Math.max(0, 100 - fiveHourRemainPct),
        resetTime: general.end_time,
      })
    }
    if (general.current_weekly_status === 1) {
      windows.push({
        window: 'weekly',
        percent: Math.max(0, 100 - general.current_weekly_remaining_percent),
        resetTime: general.weekly_end_time,
      })
    }
  }

  return { provider: 'MiniMax', windows }
}
