/**
 * 智谱开放平台（bigmodel）用量客户端。
 *
 * 接口来源（已用真实 Key 实测验证）：
 * 1. Coding Plan 额度（开源项目 cc-switch 实现，Rust 源码注释标注"实测形态"）：
 *    GET {open.bigmodel.cn|api.z.ai}/api/monitor/usage/quota/limit
 *    鉴权：Authorization: <API Key>（裸 Key，不加 Bearer）
 *    响应 data.level=套餐等级，data.limits[]：unit:3=5小时窗口，unit:6=每周窗口
 * 2. 账户余额（cc-toolkit 自定义脚本）：
 *    GET https://bigmodel.cn/api/biz/account/query-customer-account-report
 *    鉴权：Authorization: Bearer <API Key>
 * 3. 资源包列表（cc-toolkit 自定义脚本）：
 *    GET https://bigmodel.cn/api/biz/tokenAccounts/list/my?pageNum=1&pageSize=10&filterEnabled=false
 *    鉴权：Authorization: Bearer <API Key>
 */

const ZHIPU_OPEN_BASE_URL = 'https://open.bigmodel.cn'
const ZHIPU_BIZ_BASE_URL = 'https://bigmodel.cn/api/biz'

export class ZhipuApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function stringField(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

async function zhipuRequest(
  url: string,
  headers: Record<string, string>,
  apiKey: string,
  label: string,
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, { headers: { ...headers, accept: 'application/json' } })
  } catch (cause) {
    throw new ZhipuApiError('NetworkError', `${label}失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new ZhipuApiError('InvalidResponse', `${label}响应不是合法 JSON: ${text.slice(0, 200)}`)
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
    throw new ZhipuApiError(`Zhipu_${code}`, message)
  }
  return body
}

// ---------------------------------------------------------------------------
// 1. Coding Plan 额度
// ---------------------------------------------------------------------------

export interface ZhipuQuotaWindow {
  window: 'fiveHour' | 'weekly'
  total: number
  used: number
  remaining: number
  percentage: number
  nextResetTime: number
}

export interface ZhipuCodingPlanQuota {
  level: string
  windows: ZhipuQuotaWindow[]
}

/** Coding Plan 额度查询。注意鉴权用裸 Key（无 Bearer 前缀）。 */
export async function getZhipuCodingPlanQuota(apiKey: string): Promise<ZhipuCodingPlanQuota> {
  const body = await zhipuRequest(
    `${ZHIPU_OPEN_BASE_URL}/api/monitor/usage/quota/limit`,
    {
      authorization: apiKey,
      'content-type': 'application/json',
      'accept-language': 'en-US,en',
    },
    apiKey,
    'Coding Plan 额度查询',
  )

  if (body.success === false) {
    throw new ZhipuApiError('Zhipu_BUSINESS', `Coding Plan 额度查询失败: ${stringField(body.msg)}`)
  }

  const data = body.data
  const limits =
    data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).limits)
      ? ((data as Record<string, unknown>).limits as Array<Record<string, unknown>>)
      : []

  const windows: ZhipuQuotaWindow[] = []
  for (const limit of limits) {
    if (limit.type !== 'CREDIT_LIMIT' && limit.type !== 'TOKENS_LIMIT') {
      continue
    }
    const unit = Number(limit.unit ?? 0)
    const windowName = unit === 3 ? 'fiveHour' : unit === 6 ? 'weekly' : null
    if (!windowName) {
      continue
    }
    windows.push({
      window: windowName,
      total: toNumber(limit.usage),
      used: toNumber(limit.currentValue),
      remaining: toNumber(limit.remaining),
      percentage: toNumber(limit.percentage),
      nextResetTime: Number(limit.nextResetTime ?? 0),
    })
  }

  return {
    level:
      data &&
      typeof data === 'object' &&
      typeof (data as Record<string, unknown>).level === 'string'
        ? ((data as Record<string, unknown>).level as string)
        : '',
    windows,
  }
}

// ---------------------------------------------------------------------------
// 2. 账户余额
// ---------------------------------------------------------------------------

export interface ZhipuAccountBalance {
  balance: number
  availableBalance: number
  rechargeAmount: number
  giveAmount: number
  creditStatus: string
}

/** 账户余额查询（控制台 biz API，Bearer Key 鉴权）。 */
export async function getZhipuAccountBalance(apiKey: string): Promise<ZhipuAccountBalance> {
  const body = await zhipuRequest(
    `${ZHIPU_BIZ_BASE_URL}/account/query-customer-account-report`,
    { authorization: `Bearer ${apiKey}`, 'user-agent': 'llm-usage-monitor/1.0' },
    apiKey,
    '账户余额查询',
  )

  if (body.code !== 200) {
    throw new ZhipuApiError('Zhipu_BUSINESS', `账户余额查询失败: ${stringField(body.msg)}`)
  }
  const data = body.data as Record<string, unknown> | null

  return {
    balance: toNumber(data?.balance),
    availableBalance: toNumber(data?.availableBalance),
    rechargeAmount: toNumber(data?.rechargeAmount),
    giveAmount: toNumber(data?.giveAmount),
    creditStatus: typeof data?.creditStatus === 'string' ? data.creditStatus : '',
  }
}

// ---------------------------------------------------------------------------
// 3. 资源包列表
// ---------------------------------------------------------------------------

export interface ZhipuTokenPackage {
  id: number
  resourcePackageName: string
  tokensMagnitude: number
  tokenBalance: number
  availableBalance: number
  consumeType: string
  status: string
  type: string
  suitableScene: string
  effectiveTime: string
  packageExpirationTime: string
}

/** 资源包列表（控制台 biz API，Bearer Key 鉴权）。 */
export async function getZhipuTokenPackages(apiKey: string): Promise<ZhipuTokenPackage[]> {
  const body = await zhipuRequest(
    `${ZHIPU_BIZ_BASE_URL}/tokenAccounts/list/my?pageNum=1&pageSize=50&filterEnabled=false`,
    { authorization: `Bearer ${apiKey}`, 'user-agent': 'llm-usage-monitor/1.0' },
    apiKey,
    '资源包查询',
  )

  if (body.code !== 200) {
    throw new ZhipuApiError('Zhipu_BUSINESS', `资源包查询失败: ${stringField(body.msg)}`)
  }
  const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []

  return rows.map((entry) => ({
    id: Number(entry.id ?? 0),
    resourcePackageName:
      typeof entry.resourcePackageName === 'string' ? entry.resourcePackageName : '',
    tokensMagnitude: toNumber(entry.tokensMagnitude),
    tokenBalance: toNumber(entry.tokenBalance),
    availableBalance: toNumber(entry.availableBalance),
    consumeType: typeof entry.consumeType === 'string' ? entry.consumeType : '',
    status: typeof entry.status === 'string' ? entry.status : '',
    type: typeof entry.type === 'string' ? entry.type : '',
    suitableScene: typeof entry.suitableScene === 'string' ? entry.suitableScene : '',
    effectiveTime: typeof entry.effectiveTime === 'string' ? entry.effectiveTime : '',
    packageExpirationTime:
      typeof entry.packageExpirationTime === 'string' ? entry.packageExpirationTime : '',
  }))
}
