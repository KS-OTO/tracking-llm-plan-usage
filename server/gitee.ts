/**
 * 模力方舟（Gitee AI）开放接口客户端。
 *
 * - OpenAPI 规范：https://ai.gitee.com/v1/yaml（Base URL: https://ai.gitee.com/v1）
 * - 文档：https://ai.gitee.com/docs/openapi/v1
 * - 鉴权（资源包余额）：Authorization: Bearer <访问令牌>
 *
 * 用量/余额：
 *   GET /v1/tokens/packages/balance —— 查询访问令牌所授权资源包的余额（Bearer）
 *
 * 代金券（未公开内部接口，仅 Web 控制台会话 Cookie 鉴权，调研见 docs/gitee-voucher-research.md）：
 *   GET /api/base/userinfo                —— 取 namespace_path（个人命名空间）
 *   GET /api/pay/{namespace}/wallet       —— coupon_cash_balance / coupon_compute_balance
 *   GET /api/pay/{namespace}/coupons      —— 代金券明细（面额/余额/过期时间/状态）
 *   Cookie 即完整登录态：只允许存放于服务端环境变量，绝不下发浏览器。
 */
import { z } from 'zod'

const GITEE_AI_BASE_URL = 'https://ai.gitee.com/v1'

export class GiteeAiApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface GiteePackageDetail {
  ident: string
  name: string
  amount: number
  balance: number
}

export interface GiteePackageBalance {
  totalAmount: number
  usedAmount: number
  balance: number
  details: GiteePackageDetail[]
}

const GiteeResponse = z.object({
  total_amount: z.coerce.number().catch(0),
  used_amount: z.coerce.number().catch(0),
  balance: z.coerce.number().catch(0),
  details: z
    .array(
      z.object({
        ident: z.string().catch(''),
        name: z.string().catch(''),
        amount: z.coerce.number().catch(0),
        balance: z.coerce.number().catch(0),
      }),
    )
    .catch([]),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
})

/** GET /tokens/packages/balance —— 资源包余额。 */
export async function fetchGiteePackageBalance(apiKey: string): Promise<GiteePackageBalance> {
  let res: Response
  try {
    res = await fetch(`${GITEE_AI_BASE_URL}/tokens/packages/balance`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
    })
  } catch (cause) {
    throw new GiteeAiApiError('NetworkError', `请求模力方舟失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new GiteeAiApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }
  const parsed = GiteeResponse.safeParse(json)
  if (!parsed.success) {
    throw new GiteeAiApiError('InvalidResponse', `响应结构无法解析: ${text.slice(0, 200)}`)
  }
  const body = parsed.data

  if (!res.ok) {
    throw new GiteeAiApiError(
      body.error?.code ?? `HTTP_${res.status}`,
      body.error?.message ?? text.slice(0, 200),
    )
  }

  return {
    totalAmount: body.total_amount,
    usedAmount: body.used_amount,
    balance: body.balance,
    details: body.details,
  }
}

// ---------------------------------------------------------------------------
// 代金券（内部接口，Cookie 会话鉴权）
// ---------------------------------------------------------------------------

export interface GiteeVoucherCoupon {
  id: number
  catalog: string
  type: string
  amount: number
  balance: number
  expiredAt: number
  status: number
  serviceTypes: string[]
}

export interface GiteeVoucherInfo {
  namespace: string
  couponCashBalance: number
  couponComputeBalance: number
  coupons: GiteeVoucherCoupon[]
}

const GiteeUserInfo = z.object({
  namespace_path: z.string().catch(''),
})

// 关键金额字段不加 .catch：字段漂移时应显式失败，而非静默展示假零值
const GiteeWallet = z.object({
  coupon_cash_balance: z.coerce.number(),
  coupon_compute_balance: z.coerce.number(),
})

const GiteeCouponItem = z.object({
  id: z.coerce.number(),
  catalog: z.string().catch(''),
  type: z.string().catch(''),
  amount: z.coerce.number(),
  balance: z.coerce.number(),
  expired_at: z.coerce.number().catch(0),
  status: z.coerce.number().catch(0),
  service_types: z.array(z.string()).catch([]),
})

const GiteeCoupons = z.object({
  total: z.coerce.number().catch(0),
  items: z.array(GiteeCouponItem).catch([]),
})

/** 三段内部接口响应 → 归一化代金券信息（纯函数，供单测直接消费）。 */
export function parseGiteeVoucher(
  userinfoJson: unknown,
  walletJson: unknown,
  couponsJson: unknown,
): GiteeVoucherInfo {
  const userinfo = GiteeUserInfo.parse(userinfoJson)
  const wallet = GiteeWallet.parse(walletJson)
  const coupons = GiteeCoupons.parse(couponsJson)
  return {
    namespace: userinfo.namespace_path,
    couponCashBalance: wallet.coupon_cash_balance,
    couponComputeBalance: wallet.coupon_compute_balance,
    coupons: coupons.items.map((item) => ({
      id: item.id,
      catalog: item.catalog,
      type: item.type,
      amount: item.amount,
      balance: item.balance,
      expiredAt: item.expired_at,
      status: item.status,
      serviceTypes: item.service_types,
    })),
  }
}

async function giteeInternalGet(url: string, cookie: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json', cookie },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (cause) {
    throw new GiteeAiApiError('NetworkError', `请求模力方舟内部接口失败: ${String(cause)}`)
  }

  if (res.status === 401 || res.status === 403) {
    throw new GiteeAiApiError(
      'CookieExpired',
      '模力方舟会话 Cookie 已过期：请重新登录 ai.gitee.com 后更新 GITEE_AI_SESSION_COOKIE 环境变量',
    )
  }
  if (!res.ok) {
    const text = await res.text()
    throw new GiteeAiApiError(`HTTP_${res.status}`, text.slice(0, 200))
  }

  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new GiteeAiApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }
}

/**
 * 用 Web 控制台会话 Cookie 查询代金券：
 * userinfo → namespace_path → wallet + coupons。
 * Cookie 约 30 天过期，过期时抛 CookieExpired（由调用方降级展示）。
 */
export async function fetchGiteeVoucher(cookie: string): Promise<GiteeVoucherInfo> {
  const userinfoJson = await giteeInternalGet('https://ai.gitee.com/api/base/userinfo', cookie)
  const namespace = parseVoucherPart(GiteeUserInfo, userinfoJson, 'userinfo').namespace_path
  if (!namespace) {
    throw new GiteeAiApiError('InvalidResponse', 'userinfo 未返回 namespace_path')
  }
  const [walletJson, couponsJson] = await Promise.all([
    giteeInternalGet(`https://ai.gitee.com/api/pay/${namespace}/wallet`, cookie),
    giteeInternalGet(
      `https://ai.gitee.com/api/pay/${namespace}/coupons?type=cash&page=1&size=100`,
      cookie,
    ),
  ])
  return parseGiteeVoucher(userinfoJson, walletJson, couponsJson)
}

/** voucher 关键字段解析失败 → 域错误（而非裸 ZodError 或假零值）。 */
function parseVoucherPart<T>(schema: z.ZodType<T>, json: unknown, label: string): T {
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new GiteeAiApiError('InvalidResponse', `代金券接口 ${label} 响应结构无法解析`)
  }
  return parsed.data
}
