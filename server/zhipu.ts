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
import { z } from 'zod'

const ZHIPU_OPEN_BASE_URL = 'https://open.bigmodel.cn'
const ZHIPU_BIZ_BASE_URL = 'https://bigmodel.cn/api/biz'

/** unit 编码 → 窗口名（智谱 quota 接口契约：3=5 小时，6=每周）。 */
const ZHIPU_WINDOW_BY_UNIT: Record<number, 'fiveHour' | 'weekly'> = {
  3: 'fiveHour',
  6: 'weekly',
}

/** 解析失败 → 域错误（避免裸 ZodError 直接暴露给 UI）。 */
function parseZhipuBody<T>(schema: z.ZodType<T>, json: unknown): T {
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ZhipuApiError('InvalidResponse', '响应结构无法解析')
  }
  return parsed.data
}

export class ZhipuApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const ErrorEnvelope = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
})

async function zhipuRequest(
  url: string,
  headers: Record<string, string>,
  apiKey: string,
  label: string,
): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { headers: { ...headers, accept: 'application/json' } })
  } catch (cause) {
    throw new ZhipuApiError('NetworkError', `${label}失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ZhipuApiError('InvalidResponse', `${label}响应不是合法 JSON: ${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(json)
    const error = envelope.success ? envelope.data.error : undefined
    throw new ZhipuApiError(
      `Zhipu_${error?.code ?? `HTTP_${res.status}`}`,
      error?.message ?? text.slice(0, 200),
    )
  }
  return json
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

const ZhipuQuotaBody = z.object({
  success: z.boolean().optional().catch(undefined),
  code: z.coerce.number().optional().catch(undefined),
  msg: z.string().catch(''),
  data: z
    .object({
      level: z.string().catch(''),
      limits: z
        .array(
          z
            .object({
              type: z.string().nullish(),
              unit: z.coerce.number().catch(0),
              usage: z.coerce.number().catch(0),
              currentValue: z.coerce.number().catch(0),
              remaining: z.coerce.number().catch(0),
              percentage: z.coerce.number().catch(0),
              nextResetTime: z.coerce.number().catch(0),
            })
            .nullish(),
        )
        .catch([]),
    })
    .catch({ level: '', limits: [] }),
})

/** Coding Plan 额度查询。注意鉴权用裸 Key（无 Bearer 前缀）。 */
export async function getZhipuCodingPlanQuota(apiKey: string): Promise<ZhipuCodingPlanQuota> {
  const json = await zhipuRequest(
    `${ZHIPU_OPEN_BASE_URL}/api/monitor/usage/quota/limit`,
    {
      authorization: apiKey,
      'content-type': 'application/json',
      // 上游按 accept-language 本地化 msg；要中文（英文 "Internal service error" 对用户无意义）
      'accept-language': 'zh-CN,zh',
    },
    apiKey,
    'Coding Plan 额度查询',
  )
  const body = parseZhipuBody(ZhipuQuotaBody, json)

  if (body.success === false) {
    // 业务码必须透传：500=上游内部错误（未订阅 Coding Plan 的账号也会走到这里），
    // 1000=Key 无效，1001=没带鉴权头。写成统一的 Zhipu_BUSINESS 就只剩一句没用的
    // "内部服务器错误"，用户无从判断是该换 Key 还是根本没订阅。
    throw new ZhipuApiError(
      `Zhipu_${body.code ?? 'BUSINESS'}`,
      `Coding Plan 额度查询失败: ${body.msg}`,
    )
  }

  const windows: ZhipuQuotaWindow[] = []
  for (const limit of body.data.limits) {
    if (!limit) {
      continue
    }
    if (limit.type !== 'CREDIT_LIMIT' && limit.type !== 'TOKENS_LIMIT') {
      continue
    }
    const windowName = ZHIPU_WINDOW_BY_UNIT[limit.unit] ?? null
    if (!windowName) {
      continue
    }
    windows.push({
      window: windowName,
      total: limit.usage,
      used: limit.currentValue,
      remaining: limit.remaining,
      percentage: limit.percentage,
      nextResetTime: limit.nextResetTime,
    })
  }

  return { level: body.data.level, windows }
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

const ZhipuBalanceBody = z.object({
  code: z.coerce.number().catch(0),
  msg: z.string().catch(''),
  data: z
    .object({
      balance: z.coerce.number().catch(0),
      availableBalance: z.coerce.number().catch(0),
      rechargeAmount: z.coerce.number().catch(0),
      giveAmount: z.coerce.number().catch(0),
      creditStatus: z.string().catch(''),
    })
    .nullable()
    .catch(null),
})

/** 账户余额查询（控制台 biz API，Bearer Key 鉴权）。 */
export async function getZhipuAccountBalance(apiKey: string): Promise<ZhipuAccountBalance> {
  const json = await zhipuRequest(
    `${ZHIPU_BIZ_BASE_URL}/account/query-customer-account-report`,
    { authorization: `Bearer ${apiKey}`, 'user-agent': 'llm-usage-monitor/1.0' },
    apiKey,
    '账户余额查询',
  )
  const body = parseZhipuBody(ZhipuBalanceBody, json)

  if (body.code !== 200) {
    throw new ZhipuApiError(`Zhipu_${body.code}`, `账户余额查询失败: ${body.msg}`)
  }

  return {
    balance: body.data?.balance ?? 0,
    availableBalance: body.data?.availableBalance ?? 0,
    rechargeAmount: body.data?.rechargeAmount ?? 0,
    giveAmount: body.data?.giveAmount ?? 0,
    creditStatus: body.data?.creditStatus ?? '',
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

const ZhipuPackageRow = z.object({
  id: z.coerce.number().catch(0),
  resourcePackageName: z.string().catch(''),
  tokensMagnitude: z.coerce.number().catch(0),
  tokenBalance: z.coerce.number().catch(0),
  availableBalance: z.coerce.number().catch(0),
  consumeType: z.string().catch(''),
  status: z.string().catch(''),
  type: z.string().catch(''),
  suitableScene: z.string().catch(''),
  effectiveTime: z.string().catch(''),
  packageExpirationTime: z.string().catch(''),
})

const ZhipuPackagesBody = z.object({
  code: z.coerce.number().catch(0),
  msg: z.string().catch(''),
  rows: z.array(ZhipuPackageRow.nullish()).catch([]),
})

/** 资源包列表（控制台 biz API，Bearer Key 鉴权）。 */
export async function getZhipuTokenPackages(apiKey: string): Promise<ZhipuTokenPackage[]> {
  const json = await zhipuRequest(
    `${ZHIPU_BIZ_BASE_URL}/tokenAccounts/list/my?pageNum=1&pageSize=50&filterEnabled=false`,
    { authorization: `Bearer ${apiKey}`, 'user-agent': 'llm-usage-monitor/1.0' },
    apiKey,
    '资源包查询',
  )
  const body = parseZhipuBody(ZhipuPackagesBody, json)

  if (body.code !== 200) {
    throw new ZhipuApiError(`Zhipu_${body.code}`, `资源包查询失败: ${body.msg}`)
  }

  return body.rows.filter((row): row is ZhipuTokenPackage => row !== null && row !== undefined)
}
