/**
 * New API（自托管大模型订阅网关，如 new-api / VoAPI 及其衍生发行版）额度查询。
 *
 * 与其他平台最大的不同有两点：
 *
 * 1. **端点不是固定的**。New API 是自托管服务，每个部署有自己的域名，
 *    因此凭据天然成对——`NEWAPI_BASE_URL` + `NEWAPI_API_KEY`，缺一不可。
 *
 * 2. **同一个账号可能是两种计费模式之一**（站点可同时存在，按 billing_preference 取优先）：
 *    - **订阅模式**：`/api/subscription/self` 给出订阅额度窗口（`amount_total` /
 *      `amount_used` / `last_reset_time` / `next_reset_time`），周期内用量来自
 *      `/api/data/flow/self`。这就是「30 天窗口」这类周期额度的来源。
 *    - **充值（钱包）模式**：`/api/user/self` 的 `quota` / `used_quota` 是钱包余额，
 *      用量明细来自 `/api/data/self`（按天、按模型）。
 *    两者字段结构相近但语义不同：订阅额度每个周期重置，钱包余额只减不重置。
 *    混用会把「累计用了 5 万」当成「这个周期用了 5 万」，所以服务端必须分辨并标注 `mode`。
 *
 * 数据来源通道（自动选择，结果里的 `source` 标明）：
 *   1. 管理接口（需要**系统访问令牌**，在「个人设置 → 安全设置」生成）
 *   2. OpenAI 兼容账单接口（普通 `sk-` API Key 即可）：
 *      `/v1/dashboard/billing/subscription` 与 `/v1/dashboard/billing/usage`。
 *      实测同一站点 `/v1/models` 返回 200 而 `/api/user/self` 返回 401，
 *      只支持管理接口会变成「填了 Key 却永远看不到数据」，故鉴权失败时自动降级。
 *
 * 额度单位：new-api 内部以 quota 计，`QuotaPerUnit = 500 * 1000`，即 USD = quota / 500000。
 * 账单接口的数值由站点按自己的展示类型（USD / CNY / tokens）折算后返回，
 * 服务端无法反推币种，因此该模式下 unit 标记为 `site`，前端不带货币符号。
 *
 * 接口结构参考官方源码 QuantumNous/new-api：controller/user.go（GetSelf）、
 * controller/subscription.go（GetSubscriptionSelf）、controller/usedata.go、
 * controller/log.go、model/subscription.go（UserSubscription）。
 */
import { z } from 'zod'

export class NewApiError extends Error {
  constructor(
    public code: string,
    message: string,
    /** HTTP 状态码；鉴权失败（401/403）由调用方用于决定回落。 */
    public status?: number,
  ) {
    super(message)
  }
}

/** 1 USD = 500000 quota（new-api common.QuotaPerUnit）。 */
export const QUOTA_PER_UNIT = 500_000

/** 账单接口在「无限额度」时返回的哨兵值（源码中写死的 100000000）。 */
export const UNLIMITED_AMOUNT = 100_000_000

/** 钱包模式下统计用量明细的区间（天）；订阅模式用订阅周期本身。 */
export const RANGE_DAYS = 30

/** 模型明细最多保留的条目数：卡片只做概览，完整列表属于弹窗。 */
const MODEL_LIMIT = 8

/** 站点相对路径：控制台与「可用模型 / 定价」页。 */
export const CONSOLE_PATH = 'dashboard'
export const MODELS_PATH = 'pricing'

export interface NewApiModelUsage {
  model: string
  quota: number
  requests: number
  tokens: number
}

export interface NewApiStats {
  quota: number
  rpm: number
  tpm: number
}

/** 订阅额度窗口（周期制）。数值已折算为额度单位，时间戳为毫秒。 */
export interface NewApiSubscriptionInfo {
  status: string
  planId: number | null
  total: number | null
  used: number
  remain: number | null
  /** 已用百分比（0–100）。 */
  percent: number
  lastResetAt: number | null
  nextResetAt: number | null
  /** 订阅本身的有效期（不是周期）。 */
  endAt: number | null
  /** 订阅额度用尽后是否允许回落到钱包余额。 */
  allowWalletOverflow: boolean
}

/** 钱包（充值余额）：只减不重置。 */
export interface NewApiWalletInfo {
  remain: number | null
  used: number
  total: number | null
  unlimited: boolean
  requestCount: number | null
  /** 原始 quota 值，用于核对站点自己的显示口径。 */
  quotaRemain: number | null
  quotaUsed: number | null
}

export interface NewApiAccountData {
  baseUrl: string
  /** 站点控制台地址（{baseUrl}/dashboard）。 */
  consoleUrl: string
  /** 站点「可用模型」页（{baseUrl}/pricing）。 */
  modelsUrl: string
  /** 数据来源：管理接口 / OpenAI 兼容账单接口。 */
  source: 'api' | 'billing'
  /** 额度单位：USD（按 QuotaPerUnit 折算）/ site（站点自有单位，币种未知）。 */
  unit: 'USD' | 'site'
  username: string | null
  group: string | null
  /**
   * 计费模式：
   * - subscription：有生效中的订阅，站点按周期额度计费
   * - wallet：只有钱包余额（或无法分辨的账单接口回落）
   * - both：两者都有，实际扣费顺序看 billingPreference
   */
  mode: 'subscription' | 'wallet' | 'both'
  /** 站点 / 用户的扣费偏好：subscription_first / wallet_first。 */
  billingPreference: string | null
  subscription: NewApiSubscriptionInfo | null
  wallet: NewApiWalletInfo | null
  /** 当前窗口（订阅周期，或钱包模式的近 30 天）内按模型的用量。 */
  models: NewApiModelUsage[]
  windowStart: number | null
  windowEnd: number | null
  stats: NewApiStats | null
}

export interface NewApiCredentials {
  baseUrl: string
  apiKey: string
  /** New-Api-User 请求头：管理员代查他人数据时需要，个人自查可省略。 */
  userId?: string
}

/** 补协议、补尾斜杠：自托管域名用户常写成 `ai.example.com` 或漏掉最后的 /。 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return ''
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.endsWith('/') ? withScheme : `${withScheme}/`
}

/** 站点内页地址：控制台 / 可用模型（定价）。 */
export function siteUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl)
  return base === '' ? '' : base + path.replace(/^\//, '')
}

const ErrorEnvelope = z.object({
  message: z.string().optional(),
  error: z.object({ message: z.string().optional(), code: z.string().optional() }).nullish(),
})

function messageOf(json: unknown): string | undefined {
  const parsed = ErrorEnvelope.safeParse(json)
  if (!parsed.success) {
    return undefined
  }
  return parsed.data.error?.message ?? parsed.data.message
}

async function newApiGet(
  creds: NewApiCredentials,
  path: string,
  params?: Record<string, number>,
): Promise<unknown> {
  const base = normalizeBaseUrl(creds.baseUrl)
  let url: URL
  try {
    url = new URL(path, base)
  } catch {
    throw new NewApiError('InvalidEndpoint', `New API 站点地址无效: ${creds.baseUrl}`)
  }
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${creds.apiKey}`,
    accept: 'application/json',
  }
  if (creds.userId) {
    headers['new-api-user'] = creds.userId
  }

  let res: Response
  try {
    res = await fetch(url, { headers })
  } catch (cause) {
    throw new NewApiError('NetworkError', `New API 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new NewApiError('InvalidResponse', `New API 响应不是合法 JSON: ${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    throw new NewApiError(
      `NewApi_HTTP_${res.status}`,
      messageOf(json) ?? text.slice(0, 200),
      res.status,
    )
  }
  return json
}

const SelfBody = z.object({
  success: z.boolean().optional(),
  data: z
    .object({
      username: z.string().nullish(),
      display_name: z.string().nullish(),
      group: z.string().nullish(),
      quota: z.coerce.number().nullish(),
      used_quota: z.coerce.number().nullish(),
      request_count: z.coerce.number().nullish(),
    })
    .nullish(),
})

export interface NewApiSelf {
  username: string | null
  displayName: string | null
  group: string | null
  /** 剩余额度（quota 单位）。 */
  quota: number
  /** 已用额度（quota 单位）。 */
  usedQuota: number
  requestCount: number | null
}

export function parseSelf(body: unknown): NewApiSelf {
  const parsed = SelfBody.safeParse(body)
  if (!parsed.success || !parsed.data.data) {
    throw new NewApiError('InvalidResponse', 'New API /api/user/self 响应结构无法解析')
  }
  if (parsed.data.success === false) {
    throw new NewApiError('NewApi_Business', messageOf(body) ?? 'New API 返回业务失败')
  }
  const data = parsed.data.data
  return {
    username: data.username ?? null,
    displayName: data.display_name ?? null,
    group: data.group ?? null,
    quota: data.quota ?? 0,
    usedQuota: data.used_quota ?? 0,
    requestCount: data.request_count ?? null,
  }
}

const SubscriptionBody = z.object({
  success: z.boolean().optional(),
  billing_preference: z.string().nullish(),
  data: z
    .object({
      billing_preference: z.string().nullish(),
      subscriptions: z
        .array(
          z.object({
            subscription: z
              .object({
                id: z.coerce.number().nullish(),
                plan_id: z.coerce.number().nullish(),
                status: z.string().nullish(),
                amount_total: z.coerce.number().catch(0),
                amount_used: z.coerce.number().catch(0),
                start_time: z.coerce.number().catch(0),
                end_time: z.coerce.number().catch(0),
                last_reset_time: z.coerce.number().catch(0),
                next_reset_time: z.coerce.number().catch(0),
                allow_wallet_overflow: z.boolean().catch(false),
              })
              .nullish(),
          }),
        )
        .catch([]),
    })
    .nullish(),
})

export interface NewApiSubscriptionResult {
  preference: string | null
  /** 生效中的订阅；没有订阅（或已过期 / 已取消）时为 null。 */
  active: NewApiSubscriptionInfo | null
}

/**
 * 订阅额度解析。
 *
 * 只认 `status === 'active'` 的订阅：expired / cancelled 的额度窗口已经失效，
 * 拿它的 amount_used 会让人误以为「这个周期还能用」。
 */
export function parseSubscriptionSelf(body: unknown): NewApiSubscriptionResult {
  const parsed = SubscriptionBody.safeParse(body)
  const preference =
    parsed.success && parsed.data.data
      ? (parsed.data.data.billing_preference ?? parsed.data.billing_preference ?? null)
      : null
  if (!parsed.success || !parsed.data.data) {
    return { preference, active: null }
  }

  for (const entry of parsed.data.data.subscriptions) {
    const sub = entry.subscription
    if (!sub || sub.status !== 'active') {
      continue
    }
    const total = sub.amount_total / QUOTA_PER_UNIT
    const used = sub.amount_used / QUOTA_PER_UNIT
    return {
      preference,
      active: {
        status: sub.status,
        planId: sub.plan_id ?? null,
        total,
        used,
        remain: Math.max(0, total - used),
        percent: total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0,
        lastResetAt: sub.last_reset_time > 0 ? sub.last_reset_time * 1000 : null,
        nextResetAt: sub.next_reset_time > 0 ? sub.next_reset_time * 1000 : null,
        endAt: sub.end_time > 0 ? sub.end_time * 1000 : null,
        allowWalletOverflow: sub.allow_wallet_overflow,
      },
    }
  }
  return { preference, active: null }
}

const LogStatBody = z.object({
  data: z
    .object({
      quota: z.coerce.number().catch(0),
      rpm: z.coerce.number().catch(0),
      tpm: z.coerce.number().catch(0),
    })
    .nullish(),
})

/** 区间用量统计；结构不符时返回 null（不视为故障，卡片隐藏该读数即可）。 */
export function parseLogStat(body: unknown): NewApiStats | null {
  const parsed = LogStatBody.safeParse(body)
  if (!parsed.success || !parsed.data.data) {
    return null
  }
  const data = parsed.data.data
  return { quota: data.quota / QUOTA_PER_UNIT, rpm: data.rpm, tpm: data.tpm }
}

const QuotaDatesBody = z.object({
  data: z
    .array(
      z.object({
        model_name: z.string().nullish(),
        quota: z.coerce.number().catch(0),
        count: z.coerce.number().catch(0),
        token_used: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
})

/**
 * 按模型聚合区间用量。
 *
 * `/api/data/self`（钱包，按天）与 `/api/data/flow/self`（订阅，按 token 聚合）
 * 的行结构几乎一致，共用这一个解析器；结果按额度降序、截断到 MODEL_LIMIT 条 ——
 * 卡片只放概览，完整明细属于详情弹窗。
 */
export function parseQuotaDates(body: unknown): NewApiModelUsage[] {
  const parsed = QuotaDatesBody.safeParse(body)
  if (!parsed.success) {
    return []
  }
  const totals = new Map<string, NewApiModelUsage>()
  for (const row of parsed.data.data) {
    const model = row.model_name?.trim() || '未知模型'
    const current = totals.get(model)
    if (current) {
      current.quota += row.quota
      current.requests += row.count
      current.tokens += row.token_used
      continue
    }
    totals.set(model, {
      model,
      quota: row.quota,
      requests: row.count,
      tokens: row.token_used,
    })
  }
  return Array.from(totals.values())
    .toSorted((a, b) => b.quota - a.quota)
    .slice(0, MODEL_LIMIT)
    .map((item) => ({
      model: item.model,
      quota: item.quota / QUOTA_PER_UNIT,
      requests: item.requests,
      tokens: item.tokens,
    }))
}

const BillingSubscriptionBody = z.object({
  hard_limit_usd: z.coerce.number().nullish(),
  soft_limit_usd: z.coerce.number().nullish(),
  access_until: z.coerce.number().nullish(),
})

export interface NewApiBillingSubscription {
  /** 总额度（站点自有单位）；无限额度时为哨兵值。 */
  amount: number
  unlimited: boolean
  expiredAt: number | null
}

export function parseBillingSubscription(body: unknown): NewApiBillingSubscription {
  const parsed = BillingSubscriptionBody.safeParse(body)
  if (!parsed.success) {
    throw new NewApiError('InvalidResponse', 'New API 账单接口响应结构无法解析')
  }
  const amount = parsed.data.hard_limit_usd ?? parsed.data.soft_limit_usd ?? 0
  const accessUntil = parsed.data.access_until ?? 0
  return {
    amount,
    unlimited: amount >= UNLIMITED_AMOUNT,
    expiredAt: accessUntil > 0 ? accessUntil * 1000 : null,
  }
}

const BillingUsageBody = z.object({
  total_usage: z.coerce.number().nullish(),
})

/** 账单接口的 total_usage 是「已用 × 100」，与 OpenAI 的口径一致。 */
export function parseBillingUsage(body: unknown): number {
  const parsed = BillingUsageBody.safeParse(body)
  if (!parsed.success) {
    throw new NewApiError('InvalidResponse', 'New API 用量接口响应结构无法解析')
  }
  return (parsed.data.total_usage ?? 0) / 100
}

/**
 * 是否属于「凭据不被管理接口接受」——需要回落到账单接口。
 *
 * 401/403 之外的失败（网络不通、站点返回 HTML、JSON 解析失败）不该静默降级：
 * 降级后只会看到「字段变少」，用户会误以为站点没数据，反而掩盖真实故障。
 */
export function shouldFallbackToBilling(error: unknown): boolean {
  return error instanceof NewApiError && (error.status === 401 || error.status === 403)
}

/** 账单接口模式：字段少，但普通 API Key 也能用；无法分辨订阅 / 钱包，按钱包处理。 */
async function fetchBillingMode(creds: NewApiCredentials): Promise<NewApiAccountData> {
  const baseUrl = normalizeBaseUrl(creds.baseUrl)
  const [subscription, used] = await Promise.all([
    newApiGet(creds, 'v1/dashboard/billing/subscription').then(parseBillingSubscription),
    newApiGet(creds, 'v1/dashboard/billing/usage').then(parseBillingUsage),
  ])
  const total = subscription.unlimited ? null : subscription.amount
  return {
    baseUrl,
    consoleUrl: siteUrl(baseUrl, CONSOLE_PATH),
    modelsUrl: siteUrl(baseUrl, MODELS_PATH),
    source: 'billing',
    unit: 'site',
    username: null,
    group: null,
    mode: 'wallet',
    billingPreference: null,
    subscription: null,
    wallet: {
      remain: subscription.unlimited ? null : Math.max(0, subscription.amount - used),
      used,
      total,
      unlimited: subscription.unlimited,
      requestCount: null,
      quotaRemain: null,
      quotaUsed: null,
    },
    models: [],
    windowStart: null,
    windowEnd: null,
    stats: null,
  }
}

export async function fetchNewApi(creds: NewApiCredentials): Promise<NewApiAccountData> {
  const baseUrl = normalizeBaseUrl(creds.baseUrl)

  let self: NewApiSelf
  try {
    self = parseSelf(await newApiGet(creds, 'api/user/self'))
  } catch (error) {
    if (shouldFallbackToBilling(error)) {
      return await fetchBillingMode(creds)
    }
    throw error
  }

  // 订阅信息独立容错：站点没开订阅功能（或接口被关）时退化为纯钱包模式
  const subscriptionResult = await newApiGet(creds, 'api/subscription/self').then(
    parseSubscriptionSelf,
    () => ({ preference: null, active: null }),
  )

  const walletRemain = self.quota / QUOTA_PER_UNIT
  const walletUsed = self.usedQuota / QUOTA_PER_UNIT
  const hasWallet = self.quota > 0 || self.usedQuota > 0
  const active = subscriptionResult.active

  const mode: NewApiAccountData['mode'] = active ? (hasWallet ? 'both' : 'subscription') : 'wallet'

  /**
   * 用量窗口：订阅模式取**当前订阅周期**（上次重置 → 现在），钱包模式取近 30 天。
   *
   * 不能用同一个区间：订阅额度每个周期清零，拿 30 天去问「这个周期用了多少」
   * 会跨周期累加，数字虚高。
   */
  const nowSeconds = Math.floor(Date.now() / 1000)
  const startSeconds = active?.lastResetAt
    ? Math.floor(active.lastResetAt / 1000)
    : nowSeconds - RANGE_DAYS * 86_400
  const range = { start_timestamp: startSeconds, end_timestamp: nowSeconds }

  const [stats, models] = await Promise.all([
    newApiGet(creds, 'api/log/self/stat', range).then(parseLogStat, () => null),
    // 订阅优先：周期内的消耗走 flow 接口，钱包才走 data/self
    newApiGet(creds, active ? 'api/data/flow/self' : 'api/data/self', range).then(
      parseQuotaDates,
      () => [],
    ),
  ])

  return {
    baseUrl,
    consoleUrl: siteUrl(baseUrl, CONSOLE_PATH),
    modelsUrl: siteUrl(baseUrl, MODELS_PATH),
    source: 'api',
    unit: 'USD',
    username: self.displayName || self.username,
    group: self.group,
    mode,
    billingPreference: subscriptionResult.preference,
    subscription: active,
    wallet: hasWallet
      ? {
          remain: walletRemain,
          used: walletUsed,
          total: walletRemain + walletUsed,
          unlimited: false,
          requestCount: self.requestCount,
          quotaRemain: self.quota,
          quotaUsed: self.usedQuota,
        }
      : null,
    models,
    windowStart: startSeconds * 1000,
    windowEnd: nowSeconds * 1000,
    stats,
  }
}
