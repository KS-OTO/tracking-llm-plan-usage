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
  window: 'fiveHour' | 'weekly' | 'monthly'
  percent: number
  resetTime: number
  /**
   * 上游返回的窗口状态。
   *
   * 仅 OpenCode Go 提供该字段，取值为 `ok` / `rate-limited`（超额时上游会限流）。
   * 缺省表示「不适用或正常」——`ok` 会被解析层归一化为缺省，
   * 因此消费方只需判断 `status !== undefined` 即可识别异常窗口。
   */
  status?: string
  /** 上游给出的绝对用量（货币额度型套餐，如 Command Code / ZenMux）。 */
  used?: number
  /** 上游给出的总额度；与 `used` 成对出现时数值行展示「已用 X / Y」。 */
  total?: number
  /** `used` / `total` 的币种代码（USD）。 */
  unit?: string
}

export interface TokenPlanInfo {
  provider: string
  /** 套餐标识 / 等级（上游返回时展示在详情里，如 Command Code 的 planId）。 */
  plan?: string
  /** 账户级余额（如 Command Code 的 credit balance），与窗口额度分开。 */
  balance?: { remaining: number; unit: string; label?: string }
  windows: TokenPlanWindow[]
}

/**
 * 重置时间归一化为毫秒。
 * 各平台口径不一：毫秒时间戳 / 秒时间戳 / ISO 字符串；无法解析时返回 0
 * （前端展示为「—」，不视为故障）。
 */
export function resetTimeToMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // 秒级时间戳（< 1e12）换算为毫秒，避免把 10 位秒误当 1970 年毫秒
    return value > 0 && value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const ErrorEnvelope = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
})

async function planGet(url: string, apiKey: string, provider: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (cause) {
    throw new PlanApiError('NetworkError', `${provider} 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  if (!res.ok) {
    // 404/502 之类常返回纯文本；先按状态归类，避免被误判成「响应不是 JSON」
    let errorJson: unknown
    try {
      errorJson = JSON.parse(text)
    } catch {
      errorJson = undefined
    }
    const envelope = ErrorEnvelope.safeParse(errorJson)
    const error = envelope.success ? envelope.data.error : undefined
    const detail = error?.message ?? text.slice(0, 200)
    throw new PlanApiError(
      `${provider}_${error?.code ?? `HTTP_${res.status}`}`,
      res.status === 401
        ? `${provider} API Key 无效或已失效（HTTP 401）`
        : res.status === 403
          ? `${provider} 无权限或未开通该套餐（HTTP 403）`
          : `${provider} 请求失败（HTTP ${res.status}）：${detail}`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PlanApiError(
      'InvalidResponse',
      `${provider} 响应不是合法 JSON: ${text.slice(0, 200)}`,
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

export type MiniMaxSite = 'cn' | 'global'

/** 站点归一化；未知值直接报配置错误，避免悄悄打到错误区域。 */
export function normalizeMiniMaxSite(value: string | undefined): MiniMaxSite {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'cn' || normalized === 'china') {
    return 'cn'
  }
  if (normalized === 'global' || normalized === 'intl' || normalized === 'io') {
    return 'global'
  }
  throw new PlanApiError('InvalidConfig', 'MINIMAX_SITE 只能是 cn 或 global')
}

/**
 * 新接口 `/v1/token_plan/remains` 会明确要求 Bearer API Key；
 * 旧接口 `/v1/api/openplatform/coding_plan/remains` 在无鉴权时提示
 * “cookie is missing”，部分老账号仍只在新旧其中之一有数据，故按顺序回落。
 */
function miniMaxUsageUrls(site: MiniMaxSite): [string, string] {
  const host = site === 'cn' ? 'https://api.minimaxi.com' : 'https://api.minimax.io'
  return [`${host}/v1/token_plan/remains`, `${host}/v1/api/openplatform/coding_plan/remains`]
}

/** MiniMax Token Plan。 */
export async function fetchMiniMaxPlan(
  apiKey: string,
  site: MiniMaxSite = 'cn',
): Promise<TokenPlanInfo> {
  const [primary, fallback] = miniMaxUsageUrls(site)
  try {
    return parseMiniMaxPlan(await planGet(primary, apiKey, 'MiniMax'))
  } catch (cause) {
    // 只有路由不存在才回落到旧接口；鉴权/业务错误直接透出，避免重复打上游
    const code = cause instanceof PlanApiError ? cause.code : ''
    if (!['HTTP_404', 'HTTP_405', 'HTTP_410'].some((status) => code.includes(status))) {
      throw cause
    }
  }
  return parseMiniMaxPlan(await planGet(fallback, apiKey, 'MiniMax'))
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
        current_interval_remaining_percent: z.coerce.number().nullish(),
        current_interval_status: z.coerce.number().nullish(),
        current_interval_total_count: z.coerce.number().nullish(),
        current_weekly_status: z.coerce.number().nullish(),
        current_weekly_remaining_percent: z.coerce.number().nullish(),
        current_weekly_total_count: z.coerce.number().nullish(),
        end_time: z.coerce.number().catch(0),
        weekly_end_time: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
})

/** 额度窗口状态：1 正常，2 已用尽，3 不限量（该套餐不含此窗口）。 */
const MINIMAX_STATUS_EXHAUSTED = 2
const MINIMAX_STATUS_UNLIMITED = 3

function remainingToUsedPercent(remaining: number): number {
  return Math.min(100, Math.max(0, 100 - remaining))
}

export function parseMiniMaxPlan(body: unknown): TokenPlanInfo {
  const parsed = parsePlanBody(MiniMaxBody, body)

  if (parsed.base_resp && parsed.base_resp.status_code !== 0) {
    throw new PlanApiError(
      `MiniMax_${parsed.base_resp.status_code}`,
      `MiniMax 返回错误: ${parsed.base_resp.status_msg}`,
    )
  }

  const windows: TokenPlanWindow[] = []
  const general = parsed.model_remains.find((item) => item.model_name === 'general')
  if (!general) {
    throw new PlanApiError('MiniMax_NO_DATA', 'MiniMax 响应未包含 general 额度桶')
  }

  // 不在当前套餐内的模型会同时报「不限量 + 总量 0 + 剩余 100%」，
  // 直接展示会伪装成一条健康额度；识别后明确报错。
  const unavailable =
    (general.current_interval_total_count ?? 0) === 0 &&
    (general.current_weekly_total_count ?? 0) === 0 &&
    general.current_interval_status === MINIMAX_STATUS_UNLIMITED &&
    general.current_weekly_status === MINIMAX_STATUS_UNLIMITED
  if (unavailable) {
    throw new PlanApiError('MiniMax_NO_PLAN', '当前 MiniMax 套餐不包含 general 额度')
  }

  if (
    general.current_interval_remaining_percent !== null &&
    general.current_interval_remaining_percent !== undefined
  ) {
    windows.push({
      window: 'fiveHour',
      percent:
        general.current_interval_status === MINIMAX_STATUS_EXHAUSTED
          ? 100
          : remainingToUsedPercent(general.current_interval_remaining_percent),
      resetTime: general.end_time,
    })
  }

  const weeklyStatus = general.current_weekly_status
  const weeklyRemaining = general.current_weekly_remaining_percent
  const weeklyIncluded =
    weeklyStatus === MINIMAX_STATUS_EXHAUSTED ||
    weeklyStatus === 1 ||
    ((weeklyStatus === null || weeklyStatus === undefined) &&
      weeklyRemaining !== null &&
      weeklyRemaining !== undefined)
  if (weeklyIncluded) {
    windows.push({
      window: 'weekly',
      percent:
        weeklyStatus === MINIMAX_STATUS_EXHAUSTED
          ? 100
          : remainingToUsedPercent(weeklyRemaining ?? 100),
      resetTime: general.weekly_end_time,
    })
  }

  if (windows.length === 0) {
    throw new PlanApiError('MiniMax_NO_DATA', 'MiniMax 响应未包含可识别的额度窗口')
  }
  return { provider: 'MiniMax', windows }
}
