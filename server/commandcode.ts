/**
 * Command Code 订阅额度查询（对齐 CC-Switch `services/coding_plan.rs` 的 CommandCode 分支）。
 *
 * `/alpha` 是官方 CLI 使用的私有控制面路由，固定在根域名
 * `https://api.commandcode.ai`；推理数据面才走 `/provider`、`/provider/v1`。
 *
 * 查询序列：
 * 1. `GET /alpha/whoami?limits=1` → `org.id`
 * 2. `GET /alpha/billing/credits?orgId=…` → `credits.{monthlyCredits,purchasedCredits,freeCredits}`
 *    以及 `windowLimits.{fiveHour,weekly}`（`{used, cap, resetAt}`）
 * 3. `GET /alpha/billing/subscriptions?orgId=…` → 计费周期 `currentPeriodEnd`
 * 4. `GET /alpha/usage/summary?since=<周期起点>&orgId=…` → `totalCost`
 *
 * 窗口口径与 CC-Switch 一致：
 * - `windowLimits.limited === true` 时展示 5 小时 / 每周两个滚动窗口；
 * - 月度窗口是套餐级额度，已用百分比 = `totalCost / (totalCost + 剩余 credits)`；
 * - `purchasedCredits` / `freeCredits` 只参与月度池，不参与滚动窗口。
 */
import { z } from 'zod'

import {
  PlanApiError,
  resetTimeToMillis,
  type TokenPlanInfo,
  type TokenPlanWindow,
} from './plans.ts'

export const COMMAND_CODE_API_BASE = 'https://api.commandcode.ai'

const REQUEST_TIMEOUT_MS = 15_000

const ErrorEnvelope = z.object({
  error: z.object({ message: z.string().optional() }).optional(),
  message: z.string().optional(),
})

async function commandCodeGet(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, COMMAND_CODE_API_BASE)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new PlanApiError('NetworkError', `Command Code 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PlanApiError(
      res.ok ? 'InvalidResponse' : `CommandCode_HTTP_${res.status}`,
      `Command Code 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(json)
    const detail =
      (envelope.success ? (envelope.data.error?.message ?? envelope.data.message) : undefined) ??
      text.slice(0, 200)
    const message =
      res.status === 401
        ? `Command Code API Key 无效或已失效（HTTP 401）`
        : res.status === 403
          ? `Command Code 无权限或未开通订阅（HTTP 403）`
          : `Command Code 请求失败（HTTP ${res.status}）：${detail}`
    throw new PlanApiError(`CommandCode_HTTP_${res.status}`, message)
  }
  return json
}

const CommandCodeWindow = z.object({
  used: z.coerce.number(),
  cap: z.coerce.number(),
  resetAt: z.unknown().optional(),
})

const CommandCodeWindowLimits = z.object({
  limited: z.boolean().nullish(),
  fiveHour: CommandCodeWindow.nullish(),
  weekly: CommandCodeWindow.nullish(),
})

const CommandCodeCredits = z.object({
  planId: z.string().nullish(),
  monthlyCredits: z.coerce.number().nullish(),
  purchasedCredits: z.coerce.number().nullish(),
  freeCredits: z.coerce.number().nullish(),
  // 实际 credits 响应把 windowLimits 放在 credits 同级；保留嵌套位置兼容变体
  windowLimits: CommandCodeWindowLimits.nullish(),
})

const CommandCodeCreditsBody = z.object({
  credits: CommandCodeCredits,
  // 已出现的响应变体把 planId 放在 credits 同级
  planId: z.string().nullish(),
  windowLimits: CommandCodeWindowLimits.nullish(),
})

const CommandCodeSubscriptionBody = z.object({
  data: z
    .object({
      planId: z.string().nullish(),
      currentPeriodStart: z.unknown().optional(),
      currentPeriodEnd: z.unknown().optional(),
    })
    .nullish(),
})

const CommandCodeSummaryBody = z.object({
  totalCost: z.coerce.number(),
})

/** 绝对额度窗口 → 已用百分比；`cap <= 0` 视为该窗口未启用。 */
function windowOf(
  window: z.infer<typeof CommandCodeWindow> | null | undefined,
  name: TokenPlanWindow['window'],
): TokenPlanWindow | null {
  if (!window || window.cap <= 0 || !Number.isFinite(window.cap)) {
    return null
  }
  const percent = Math.min(100, Math.max(0, (window.used / window.cap) * 100))
  return {
    window: name,
    percent,
    // 上游在 0 用量时回 `resetAt: 0`（没有活跃窗口），当作「无重置时间」
    resetTime: resetTimeToMillis(window.resetAt),
    used: window.used,
    total: window.cap,
    unit: 'credits',
  }
}

export function parseCommandCodeQuota(
  creditsBody: unknown,
  subscriptionBody: unknown,
  summaryBody: unknown,
): TokenPlanInfo {
  const creditsParsed = CommandCodeCreditsBody.safeParse(creditsBody)
  if (!creditsParsed.success) {
    throw new PlanApiError('InvalidResponse', 'Command Code 响应缺少 credits 字段')
  }
  const summaryParsed = CommandCodeSummaryBody.safeParse(summaryBody)

  const credits = creditsParsed.data.credits
  const windows: TokenPlanWindow[] = []
  const windowLimits = creditsParsed.data.windowLimits ?? credits.windowLimits
  if (windowLimits?.limited === true) {
    const fiveHour = windowOf(windowLimits.fiveHour, 'fiveHour')
    const weekly = windowOf(windowLimits.weekly, 'weekly')
    if (fiveHour) {
      windows.push(fiveHour)
    }
    if (weekly) {
      windows.push(weekly)
    }
  }

  const subscription = CommandCodeSubscriptionBody.safeParse(subscriptionBody)
  const subscriptionData = subscription.success ? subscription.data.data : undefined
  const plan = subscriptionData?.planId ?? credits.planId ?? creditsParsed.data.planId

  const remaining =
    Math.max(0, credits.monthlyCredits ?? 0) +
    Math.max(0, credits.purchasedCredits ?? 0) +
    Math.max(0, credits.freeCredits ?? 0)
  if (summaryParsed.success) {
    const spent = Math.max(0, summaryParsed.data.totalCost)
    const pool = spent + remaining
    windows.push({
      window: 'monthly',
      percent: pool > 0 ? (spent / pool) * 100 : 0,
      resetTime: resetTimeToMillis(subscriptionData?.currentPeriodEnd),
      used: spent,
      total: pool,
      unit: 'credits',
    })
  }

  return {
    provider: 'Command Code',
    ...(typeof plan === 'string' && plan !== '' ? { plan } : {}),
    balance: { remaining, unit: 'credits', label: 'Credit balance' },
    windows,
  }
}

export async function fetchCommandCodePlan(apiKey: string): Promise<TokenPlanInfo> {
  const whoami = z
    .object({ org: z.object({ id: z.string().nullish() }).nullish() })
    .safeParse(await commandCodeGet('/alpha/whoami', apiKey, { limits: '1' }))
  if (!whoami.success) {
    throw new PlanApiError('InvalidResponse', 'Command Code whoami 响应结构无法解析')
  }
  const orgId = whoami.data.org?.id ?? undefined
  const orgParams: Record<string, string> = orgId ? { orgId } : {}

  const [credits, subscription] = await Promise.all([
    commandCodeGet('/alpha/billing/credits', apiKey, orgParams),
    // 按量付费账号可能没有 subscriptions 路由/记录：失败不应拖垮余额与窗口
    commandCodeGet('/alpha/billing/subscriptions', apiKey, orgParams).catch(() => null),
  ])

  const subscriptionParsed = CommandCodeSubscriptionBody.safeParse(subscription)
  const periodStart = subscriptionParsed.success
    ? subscriptionParsed.data.data?.currentPeriodStart
    : undefined
  const summaryParams: Record<string, string> = { ...orgParams }
  if (typeof periodStart === 'string' && periodStart !== '') {
    summaryParams.since = periodStart
  }
  const summary =
    subscription === null
      ? null
      : await commandCodeGet('/alpha/usage/summary', apiKey, summaryParams).catch(() => null)

  return parseCommandCodeQuota(credits, subscription, summary)
}
