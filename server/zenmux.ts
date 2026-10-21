/**
 * ZenMux 套餐额度查询（对齐 CC-Switch `services/coding_plan.rs` 的 ZenMux 分支）。
 *
 * `GET {baseUrl}`，`Authorization: Bearer <API Key>`；baseUrl 由用户配置，
 * 默认 `https://zenmux.ai/api/v1`（CC-Switch 的 Claude 预设地址）。
 *
 * 响应 `data`：
 * - `quota_5_hour` / `quota_7_day`：`{ usage_percentage(0–1), resets_at,
 *   used_value_usd, max_value_usd }`
 * - `plan.tier`、`account_status`
 */
import { z } from 'zod'

import {
  PlanApiError,
  resetTimeToMillis,
  type TokenPlanInfo,
  type TokenPlanWindow,
} from './plans.ts'

export const ZENMUX_DEFAULT_BASE_URL = 'https://zenmux.ai/api/v1'

const REQUEST_TIMEOUT_MS = 15_000

const ZenMuxWindow = z.object({
  usage_percentage: z.coerce.number().nullish(),
  resets_at: z.unknown().optional(),
  used_value_usd: z.coerce.number().nullish(),
  max_value_usd: z.coerce.number().nullish(),
})

const ZenMuxBody = z.object({
  success: z.boolean().nullish(),
  message: z.string().nullish(),
  data: z
    .object({
      quota_5_hour: ZenMuxWindow.nullish(),
      quota_7_day: ZenMuxWindow.nullish(),
      plan: z.object({ tier: z.string().nullish() }).nullish(),
      account_status: z.string().nullish(),
    })
    .nullish(),
})

function windowOf(
  window: z.infer<typeof ZenMuxWindow> | null | undefined,
  name: TokenPlanWindow['window'],
): TokenPlanWindow | null {
  if (!window || window.usage_percentage === null || window.usage_percentage === undefined) {
    return null
  }
  const used = window.used_value_usd ?? null
  const total = window.max_value_usd ?? null
  return {
    window: name,
    percent: Math.min(100, Math.max(0, window.usage_percentage * 100)),
    resetTime: resetTimeToMillis(window.resets_at),
    ...(used !== null ? { used } : {}),
    ...(total !== null ? { total } : {}),
    ...(used !== null || total !== null ? { unit: 'USD' } : {}),
  }
}

export function parseZenMuxPlan(body: unknown): TokenPlanInfo {
  const parsed = ZenMuxBody.safeParse(body)
  if (!parsed.success) {
    throw new PlanApiError('InvalidResponse', 'ZenMux 响应结构无法解析')
  }
  const data = parsed.data
  if (data.success === false) {
    throw new PlanApiError('ZenMux_BUSINESS', `ZenMux 返回错误：${data.message ?? '未知错误'}`)
  }
  if (!data.data) {
    throw new PlanApiError('InvalidResponse', 'ZenMux 响应缺少 data 字段')
  }

  const windows: TokenPlanWindow[] = []
  const fiveHour = windowOf(data.data.quota_5_hour, 'fiveHour')
  const weekly = windowOf(data.data.quota_7_day, 'weekly')
  if (fiveHour) {
    windows.push(fiveHour)
  }
  if (weekly) {
    windows.push(weekly)
  }
  if (windows.length === 0) {
    throw new PlanApiError('InvalidResponse', 'ZenMux 响应未包含可识别的额度窗口')
  }

  const tier = data.data.plan?.tier ?? undefined
  const status = data.data.account_status ?? undefined
  const plan = tier ? (status ? `${tier} (${status})` : tier) : undefined
  return { provider: 'ZenMux', ...(plan ? { plan } : {}), windows }
}

export async function fetchZenMuxPlan(
  apiKey: string,
  baseUrl = ZENMUX_DEFAULT_BASE_URL,
): Promise<TokenPlanInfo> {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed === '') {
    throw new PlanApiError('InvalidConfig', 'ZENMUX_BASE_URL 不能为空')
  }

  let res: Response
  try {
    res = await fetch(trimmed, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new PlanApiError('NetworkError', `ZenMux 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PlanApiError(
      res.ok ? 'InvalidResponse' : `ZenMux_HTTP_${res.status}`,
      `ZenMux 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok) {
    const message =
      res.status === 401
        ? 'ZenMux API Key 无效或已失效（HTTP 401）'
        : res.status === 403
          ? 'ZenMux 无权限或未开通套餐（HTTP 403）'
          : `ZenMux 请求失败（HTTP ${res.status}）：${text.slice(0, 200)}`
    throw new PlanApiError(`ZenMux_HTTP_${res.status}`, message)
  }
  return parseZenMuxPlan(json)
}
