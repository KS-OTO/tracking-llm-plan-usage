/**
 * OpenCode Go 订阅额度查询（参考开源项目 cc-switch PR #6547）。
 *
 * - GET https://opencode.ai/zen/go/v1/usage（Authorization: Bearer <API Key>）
 *   该地址为 provider baseURL（https://opencode.ai/zen/go/v1）下的 /usage，
 *   与 cc-switch 的 `{{baseUrl}}/usage` usage_script 契约一致。
 * - 响应 `usage.rolling` / `usage.weekly` / `usage.monthly` 三个窗口，
 *   每个窗口 `percent` 直接是「已用百分比」，`resetsAt` 为重置时间。
 * - 窗口映射：rolling → 5 小时、weekly → 7 天、monthly → 30 天。
 *
 * 鉴权仅需 API Key，无需控制台会话（与 cc-switch 的 cookie/SSR 方案不同）。
 */
import { z } from 'zod'

import { resetTimeToMillis, type TokenPlanInfo, type TokenPlanWindow } from './plans.ts'

export const OPENCODE_GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'

export class OpenCodeApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 已用百分比：钳制到 0-100，非法值回落 0。 */
function toPercent(value: unknown): number {
  const num = typeof value === 'string' ? Number(value) : value
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return 0
  }
  return Math.min(100, Math.max(0, num))
}

const WindowShape = z.object({
  percent: z.unknown().optional(),
  resetsAt: z.unknown().optional(),
})

const UsageBody = z.object({
  usage: z
    .object({
      rolling: WindowShape.nullish(),
      weekly: WindowShape.nullish(),
      monthly: WindowShape.nullish(),
    })
    .nullish(),
})

/** 窗口顺序与展示口径：rolling(5h) → weekly(7d) → monthly(30d)。 */
const WINDOW_MAP = [
  ['rolling', 'fiveHour'],
  ['weekly', 'weekly'],
  ['monthly', 'monthly'],
] as const

/**
 * 解析 usage 响应。缺失的窗口直接跳过（例如订阅不含月度额度），
 * 而不是补一个 0% 的假窗口。
 */
export function parseOpenCodeGoUsage(body: unknown): TokenPlanInfo {
  const parsed = UsageBody.safeParse(body)
  if (!parsed.success) {
    throw new OpenCodeApiError('InvalidResponse', '响应结构无法解析')
  }

  const usage = parsed.data.usage
  const windows: TokenPlanWindow[] = []
  for (const [source, window] of WINDOW_MAP) {
    const entry = usage?.[source]
    if (!entry) {
      continue
    }
    windows.push({
      window,
      percent: toPercent(entry.percent),
      resetTime: resetTimeToMillis(entry.resetsAt),
    })
  }

  return { provider: 'OpenCode Go', windows }
}

/** OpenCode Go 订阅额度。 */
export async function fetchOpenCodeGoUsage(apiKey: string): Promise<TokenPlanInfo> {
  let res: Response
  try {
    res = await fetch(OPENCODE_GO_USAGE_URL, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    })
  } catch (cause) {
    throw new OpenCodeApiError('NetworkError', `OpenCode Go 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new OpenCodeApiError(
      res.ok ? 'InvalidResponse' : `OpenCodeGo_HTTP_${res.status}`,
      `OpenCode Go 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok) {
    const envelope = z
      .object({ error: z.object({ message: z.string().optional() }).optional() })
      .safeParse(json)
    throw new OpenCodeApiError(
      `OpenCodeGo_HTTP_${res.status}`,
      envelope.success ? (envelope.data.error?.message ?? text.slice(0, 200)) : text.slice(0, 200),
    )
  }

  return parseOpenCodeGoUsage(json)
}
