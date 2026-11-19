/**
 * OpenCode Go 订阅额度查询（参考开源项目 cc-switch PR #6547）。
 *
 * - GET https://opencode.ai/zen/go/v1/usage（Authorization: Bearer <API Key>）
 *   该地址为 provider baseURL（https://opencode.ai/zen/go/v1）下的 /usage，
 *   与 cc-switch 的 `{{baseUrl}}/usage` usage_script 契约一致。
 * - 响应 `usage.rolling` / `usage.weekly` / `usage.monthly` 三个窗口，
 *   每个窗口 `percent` 直接是「已用百分比」，`resetsAt` 为重置时间，
 *   `status` 为窗口状态（`ok` / `rate-limited`）。
 * - 窗口映射：rolling → 5 小时、weekly → 7 天、monthly → 30 天。
 *
 * 鉴权仅需 API Key，无需控制台会话（与 cc-switch 的 cookie/SSR 方案不同）。
 */
import { z } from 'zod'

import { resetTimeToMillis, type TokenPlanInfo, type TokenPlanWindow } from './plans.ts'

export const OPENCODE_GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'

/**
 * 单次尝试的超时（毫秒）。健康上游实测 0.3–1.5s，10s 已足够宽松；比原来的 15s 短，
 * 是为了让「3 次尝试 + 退避」在 cloud-functions 的 maxDuration（60s，见 edgeone.json）
 * 之内留出余量。
 */
const ATTEMPT_TIMEOUT_MS = 10_000

/**
 * 传输层失败的重试退避基准值（毫秒）；实际等待 = 基准值 × (1 + [0,1) 抖动)。
 *
 * 只在 fetch 抛错时重试：`TypeError: fetch failed` 是**连接层面**的瞬时故障
 * （EdgeOne 边缘出网偶发，实测约 0.3–0.8% 概率失败），换一条新连接重发几乎必然
 * 成功；而 401/403/4xx/5xx 是上游给出的确定答复，重试只会拿到同一个答案，还会把
 * 「Key 失效」拖成 3 倍延迟。
 */
const RETRY_BACKOFF_MS = [250, 750] as const

/**
 * 可等待的退避等待。用 `new Promise` 而不是 `Promise.withResolvers()`：后者要求
 * `lib: es2024`，而 tsconfig.node 继承 @tsconfig/node24 的 lib 设置（不含该 API）。
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 把 undici 的失败链摊平成一行。
 *
 * `TypeError: fetch failed` 自身不含任何线索：真正的错误码在 `cause` 链里
 * （`ECONNRESET` / `ETIMEDOUT` / `UND_ERR_CONNECT_TIMEOUT` / `EAI_AGAIN` …）。
 * 线上只能通过这条 message 观察（EdgeOne 日志分析只有日志文本），所以 `String(cause)`
 * 等于把唯一线索丢掉；另外 `AggregateError`（autoSelectFamily 的多地址尝试全部失败）
 * 的 message 是空串，只有 `code` 有信息量。
 */
function describeFetchFailure(cause: unknown): string {
  const parts: string[] = []
  let current: unknown = cause
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth++) {
    const err = current as { message?: unknown; code?: unknown; cause?: unknown }
    const message = typeof err.message === 'string' ? err.message : ''
    const code = typeof err.code === 'string' ? err.code : ''
    const text = [message, code && `(${code})`].filter(Boolean).join(' ')
    if (text && !parts.includes(text)) {
      parts.push(text)
    }
    current = err.cause
  }
  return parts.length > 0 ? parts.join(' <- ') : String(cause)
}

/**
 * upstream 从 2026-09-06 起要求带上 `x-opencode-session`（用于把后台轮询
 * 与普通推理请求区分开）；缺失会被当作异常客户端。进程/isolate 内复用同一个
 * 随机 ID 即可，不需要持久化。
 */
const OPENCODE_SESSION_ID = crypto.randomUUID()

export class OpenCodeApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** 已用百分比：钳制到 0-100；不可解析时返回 null（跳过该窗口，不伪造 0%）。 */
function toPercent(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : value
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return null
  }
  return Math.min(100, Math.max(0, num))
}

/**
 * 窗口状态归一化：`ok` 与空值统一为 undefined（= 正常），其余原样保留。
 *
 * 上游在窗口超额时把 `status` 置为 `rate-limited`，同时 `percent` 报 100。
 * 若丢弃该字段，UI 只能看到「已用 100%」，无法区分「额度用尽」与
 * 「上游正在限流」；未知状态同样保留，交由展示层提示而不是静默吞掉。
 */
function toStatus(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'ok') {
    return undefined
  }
  return trimmed
}

const WindowShape = z.object({
  percent: z.unknown().optional(),
  resetsAt: z.unknown().optional(),
  status: z.unknown().optional(),
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
    const percent = toPercent(entry.percent)
    if (percent === null) {
      continue
    }
    const status = toStatus(entry.status)
    windows.push({
      window,
      percent,
      // percent=0 时上游给的是「now + 窗口时长」占位值，不是真实重置时间
      resetTime: percent > 0 ? resetTimeToMillis(entry.resetsAt) : 0,
      // status 为 undefined 时不写入键，保持既有响应结构稳定
      ...(status === undefined ? {} : { status }),
    })
  }

  // 一个窗口都没解析出来 = 未文档化端点再次变形，明确报错而不是渲染空卡片
  if (windows.length === 0) {
    throw new OpenCodeApiError('InvalidResponse', 'OpenCode Go 响应未包含可识别的额度窗口')
  }
  return { provider: 'OpenCode Go', windows }
}

/** 单次尝试：连接层失败时按 `RETRY_BACKOFF_MS` 退避后递归重试，用尽则抛出原始错误。 */
async function fetchUsageWithRetry(apiKey: string, attempt: number): Promise<Response> {
  try {
    return await fetch(OPENCODE_GO_USAGE_URL, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'user-agent': 'llm-usage-monitor/1.0',
        'x-opencode-session': OPENCODE_SESSION_ID,
      },
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
  } catch (cause) {
    const backoff = RETRY_BACKOFF_MS[attempt]
    if (backoff === undefined) {
      throw cause
    }
    console.warn(
      `[opencode] usage fetch failed (attempt ${attempt + 1}/${RETRY_BACKOFF_MS.length + 1}), retrying: ${describeFetchFailure(cause)}`,
    )
    await delay(backoff * (1 + Math.random()))
    return fetchUsageWithRetry(apiKey, attempt + 1)
  }
}

/**
 * OpenCode Go 订阅额度。
 *
 * 连接层失败会重试 `RETRY_BACKOFF_MS.length` 次：多个 Key 并行查询时，边缘出网会在
 * 一次调用内同时开十几条新连接，偶发 1–2 条被重置/超时（实测约 0.3% 失败，且与 Key
 * 无关），重试即恢复 —— 机制见 `describeFetchFailure`。
 */
export async function fetchOpenCodeGoUsage(apiKey: string): Promise<TokenPlanInfo> {
  const attempts = RETRY_BACKOFF_MS.length + 1
  let res: Response
  try {
    res = await fetchUsageWithRetry(apiKey, 0)
  } catch (cause) {
    const detail = describeFetchFailure(cause)
    console.error(`[opencode] usage fetch failed after ${attempts} attempts: ${detail}`)
    throw new OpenCodeApiError('NetworkError', `OpenCode Go 请求失败（已尝试 ${attempts} 次）: ${detail}`)
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
    const detail = envelope.success
      ? (envelope.data.error?.message ?? text.slice(0, 200))
      : text.slice(0, 200)
    throw new OpenCodeApiError(
      `OpenCodeGo_HTTP_${res.status}`,
      res.status === 401
        ? 'OpenCode Go API Key 无效或已失效（HTTP 401）'
        : res.status === 403
          ? 'OpenCode Go API Key 有效，但该账号未开通 Go 订阅（HTTP 403）'
          : `OpenCode Go 请求失败（HTTP ${res.status}）：${detail}`,
    )
  }

  return parseOpenCodeGoUsage(json)
}
