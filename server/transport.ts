/**
 * 出网传输层的统一策略：每次尝试的超时、连接层失败的重试、全局在途并发闸门，
 * 以及把 undici 的失败链摊平成一行可读文本。
 *
 * 为什么要有这一层（实测，2026-11 Agent 在 EdgeOne 云函数上复现）：
 * 云函数运行时是 Node v20（undici），**单次调用内并发开十几条新连接**时，偶发个别
 * 连接建立失败，undici 只抛 `TypeError: fetch failed`，真正的错误码埋在 cause 链里
 * （`AggregateError` / `ETIMEDOUT` / `ECONNRESET` / `UND_ERR_CONNECT_TIMEOUT`）。
 * 实测失败率 0.25–0.8%/请求，与 Key、鉴权、请求内容无关，换一条新连接重发即恢复；
 * 本地同一 IP 直连 20 并发 0 失败，说明是边缘出口的瞬时抖动而非上游限流。
 *
 * 因此这里只做三件事，且刻意不做「HTTP 层重试」：
 * 1. 每次尝试独立超时（`AbortSignal.timeout`）：请求不会无限挂住；
 * 2. **仅**在 fetch 抛错（连接层）时退避重试：401/403/4xx/5xx 是上游的确定答复，
 *    重试只会拿到同一答案，还要把「Key 失效」拖成 3 倍延迟；
 * 3. 全局并发闸门：把「一次渲染 14 个平台 × 多个 Key」的突发建连压到安全水位，
 *    从源头降低抖动概率（重试只是兜底）。
 *
 * 所有调用方都是**只读查询**（余额/额度/套餐），因此重试是幂等的。
 */

/** 单次尝试的超时：健康上游实测 0.3–1.5s，10s 已足够宽松。 */
export const ATTEMPT_TIMEOUT_MS = 10_000

/** 最多尝试次数（含首次）。 */
export const MAX_ATTEMPTS = 3

/**
 * 单次调用的退避预算：超出后不再发起**新的**尝试（已在途的尝试另计）。
 * cloud-functions 的 maxDuration 是 60s（见 edgeone.json），
 * 3 × 10s 尝试 + 两段退避 ≈ 上限 31.5s，留足余量。
 */
export const TOTAL_BUDGET_MS = 25_000

/**
 * 同一 isolate 内允许的在途出网请求数。
 *
 * 依据：实测 8 并发（同 origin）0 失败，12 并发跨 origin 出现首个 `ETIMEDOUT`；
 * 取 8 落在已验证安全的区间内，同时仍能让 14 个平台并行查询在 2–3 个波次内跑完。
 */
const MAX_IN_FLIGHT = 8

/** 第 N 次重试的退避上限：实际等待 = [0, cap) 的均匀抖动（full jitter，避免多个 Key 同步重发）。 */
const RETRY_CAP_MS = [250, 750] as const

/** 可等待的退避等待。用 `new Promise` 而不是 `Promise.withResolvers()`（lib 不含该 API）。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 把 undici 的失败链摊平成一行。
 *
 * `TypeError: fetch failed` 自身不含任何线索：真正的错误码在 `cause` 链里；线上只能
 * 通过这条 message 观察（EdgeOne 日志分析只有日志文本），所以 `String(cause)` 等于
 * 把唯一线索丢掉。`AggregateError`（autoSelectFamily 多地址尝试全失败）的 message
 * 是空串，只有 `code` 有信息量。
 */
export function describeFetchFailure(cause: unknown): string {
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

/** 连接层失败：`fetch` 抛错且调用方没有主动取消。 */
export class TransportError extends Error {
  readonly detail: string
  readonly attempts: number

  constructor(attempts: number, detail: string) {
    super(`请求失败（已尝试 ${attempts} 次）: ${detail}`)
    this.name = 'TransportError'
    this.detail = detail
    this.attempts = attempts
  }
}

/**
 * 传给各 provider 的错误文案：把「重试了几次」与「失败链」一起带出来。
 *
 * provider 用法：`throw new XApiError('NetworkError', describeTransportError(cause, 'X 请求失败'))`
 * → `X 请求失败（已尝试 3 次）: fetch failed <- (ETIMEDOUT)`。
 */
export function describeTransportError(cause: unknown, label: string): string {
  if (cause instanceof TransportError) {
    return `${label}（已尝试 ${cause.attempts} 次）: ${cause.detail}`
  }
  return `${label}: ${describeFetchFailure(cause)}`
}

/**
 * 简单 FIFO 信号量。只做计数，不排队超时——真正的等待上限由每次尝试的超时兜住。
 */
let inFlight = 0
const waiters: (() => void)[] = []

function acquireSlot(): Promise<() => void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++
    return Promise.resolve(releaseSlot)
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      inFlight++
      resolve(releaseSlot)
    })
  })
}

function releaseSlot(): void {
  inFlight--
  waiters.shift()?.()
}

/** 单次尝试的信号：调用方取消（若有）与本次超时取并集。 */
function attemptSignal(caller: AbortSignal | null | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return caller ? AbortSignal.any([caller, timeout]) : timeout
}

export interface TransportOptions {
  /** 日志与错误文案里的调用方标识，如 `plans:Kimi`、`opencode:usage`。 */
  label?: string
  /** 单次尝试超时，默认 {@link ATTEMPT_TIMEOUT_MS}。 */
  timeoutMs?: number
  /** 含首次在内的最多尝试次数，默认 {@link MAX_ATTEMPTS}；设为 1 即关闭重试。 */
  maxAttempts?: number
}

/**
 * 带超时、连接层重试与并发闸门的 `fetch`。
 *
 * 抛出的错误：连接层用尽尝试 → {@link TransportError}；调用方 signal 取消 → 原样抛出
 * （不重试）。HTTP 状态码不在这里判定，交给各 provider 的既有分支。
 */
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: TransportOptions = {},
): Promise<Response> {
  const label = options.label ?? 'outbound'
  const timeoutMs = options.timeoutMs ?? ATTEMPT_TIMEOUT_MS
  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS)
  const deadline = Date.now() + TOTAL_BUDGET_MS
  return attempt(input, init, { label, timeoutMs, maxAttempts, deadline }, 1)
}

interface AttemptConfig {
  label: string
  timeoutMs: number
  maxAttempts: number
  deadline: number
}

/** 递归而不是循环：oxlint 的 `no-await-in-loop` 禁止在循环里 await。 */
async function attempt(
  input: string | URL,
  init: RequestInit,
  config: AttemptConfig,
  attemptNo: number,
): Promise<Response> {
  let cause: unknown
  const release = await acquireSlot()
  try {
    return await fetch(input, { ...init, signal: attemptSignal(init.signal, config.timeoutMs) })
  } catch (error) {
    cause = error
  } finally {
    release()
  }

  // 调用方主动取消：不是传输故障，也不该重试
  if (init.signal?.aborted === true) {
    throw cause
  }

  const detail = describeFetchFailure(cause)
  const cap = RETRY_CAP_MS[attemptNo - 1]
  const budgetLeft = config.deadline - Date.now()
  if (cap === undefined || attemptNo >= config.maxAttempts || budgetLeft <= 0) {
    console.error(`[transport] ${config.label} 失败，已尝试 ${attemptNo} 次: ${detail}`)
    throw new TransportError(attemptNo, detail)
  }

  const backoff = Math.min(Math.random() * cap, budgetLeft)
  console.warn(
    `[transport] ${config.label} 第 ${attemptNo} 次尝试失败（${detail}），${Math.round(backoff)}ms 后重试`,
  )
  await delay(backoff)
  return attempt(input, init, config, attemptNo + 1)
}
