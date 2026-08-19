/**
 * 百度智能云千帆大模型平台客户端（平台功能 OpenAPI）。
 *
 * 文档：
 * - 鉴权认证机制（bce-auth-v1 派生密钥签名）：
 *   https://cloud.baidu.com/doc/Reference/s/njwvz1yfu
 * - 量包：DescribePackageResources / DescribePackageResource（/v2/charge）
 *   https://cloud.baidu.com/doc/qianfan-api/s/Amo2ixqu7 、/s/Bmo2iv5ri
 * - TPM 配额：DescribeTPMResource（/v2/charge）
 *   https://cloud.baidu.com/doc/qianfan-api/s/Qmo1geq40
 * - 用量：DescribeServiceMetric（/v2/service）
 *   https://cloud.baidu.com/doc/qianfan-api/s/4mm33t0kj
 *
 * 鉴权使用安全认证 AK/SK（IAM 子账号需 QianfanServiceReadAccessPolicy 只读权限）。
 * 签名为 Web Crypto 实现，兼容 Bun / Node 18+ / Cloudflare Workers / EdgeOne。
 */
import { z } from 'zod'

const HOST = 'qianfan.baidubce.com'

export interface BaiduCredentials {
  accessKey: string
  secretKey: string
}

export class BaiduApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// BCE bce-auth-v1 签名（派生密钥两段 HMAC）
// ---------------------------------------------------------------------------

/** RFC3986 编码（大写十六进制），保留 -_.~ 与可选斜杠。 */
function uriEncode(value: string, encodeSlash: boolean): string {
  let out = encodeURIComponent(value)
  out = out.replace(
    /[!'()*]/g,
    (c) => ({ '!': '%21', "'": '%27', '(': '%28', ')': '%29', '*': '%2A' })[c] ?? c,
  )
  if (!encodeSlash) {
    out = out.replace(/%2F/g, '/')
  }
  return out
}

function hmacSha256Hex(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  return crypto.subtle
    .importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((cryptoKey) => crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data)))
    .then((digest) =>
      Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    )
}

/** 签名所需的规范化 Header（host + x-bce-date，UriEncode name/value）。 */
function canonicalHeaders(host: string, xBceDate: string): string {
  return [`host:${uriEncode(host, true)}`, `x-bce-date:${uriEncode(xBceDate, true)}`]
    .toSorted()
    .join('\n')
}

/** 生成 bce-auth-v1 认证头。纯函数（时间注入），便于单测向量固定。 */
export async function signBceRequest(opts: {
  method: string
  host: string
  path: string
  query: Record<string, string>
  accessKey: string
  secretKey: string
  timestamp: string
  expireSeconds?: number
}): Promise<{ authorization: string; xBceDate: string }> {
  const expire = opts.expireSeconds ?? 1800
  const authStringPrefix = `bce-auth-v1/${opts.accessKey}/${opts.timestamp}/${expire}`

  const canonicalURI = uriEncode(opts.path, false)
  const canonicalQS = Object.entries(opts.query)
    .map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
    .toSorted()
    .join('&')
  const canonicalRequest = [
    opts.method.toUpperCase(),
    canonicalURI,
    canonicalQS,
    canonicalHeaders(opts.host, opts.timestamp),
  ].join('\n')

  const signingKey = await hmacSha256Hex(opts.secretKey, authStringPrefix)
  const signature = await hmacSha256Hex(signingKey, canonicalRequest)
  const signedHeaders = ['host', 'x-bce-date']
  return {
    authorization: `${authStringPrefix}/${signedHeaders.join(';')}/${signature}`,
    xBceDate: opts.timestamp,
  }
}

// ---------------------------------------------------------------------------
// 传输
// ---------------------------------------------------------------------------

const ErrorEnvelope = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
})

/** 千帆平台 OpenAPI 通用调用：POST {path}?Action=xxx，JSON body。 */
async function qianfanCall(
  creds: BaiduCredentials,
  action: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const { authorization, xBceDate } = await signBceRequest({
    method: 'POST',
    host: HOST,
    path,
    query: { Action: action },
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    timestamp,
  })

  let res: Response
  try {
    res = await fetch(`https://${HOST}${path}?Action=${action}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'x-bce-date': xBceDate,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (cause) {
    throw new BaiduApiError('NetworkError', `请求百度千帆失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BaiduApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(json)
    const code = envelope.success ? envelope.data.code : undefined
    throw new BaiduApiError(
      code ?? `HTTP_${res.status}`,
      envelope.success ? (envelope.data.message ?? text.slice(0, 200)) : text.slice(0, 200),
    )
  }
  return json
}

// ---------------------------------------------------------------------------
// 响应 schema 与归一化
// ---------------------------------------------------------------------------

export interface QianfanPackage {
  packageId: string
  serviceName: string
  specification: string
  used: string
  status: string
  startTime: string
  expiredTime: string
  creator: string
}

export interface QianfanTpmQuota {
  instanceId: string
  model: string
  tpm: number
  status: string
  paymentTiming: string
}

export interface QianfanUsageSummary {
  serviceCount: number
  totalTokens: number
  totalCalls: number
}

export interface QianfanData {
  packages: QianfanPackage[]
  tpmQuotas: QianfanTpmQuota[]
  usage: QianfanUsageSummary
}

const PackageInstance = z.object({
  packageId: z.string().catch(''),
  serviceName: z.string().catch(''),
  specification: z.coerce.string().catch(''),
  used: z.coerce.string().catch(''),
  status: z.string().catch(''),
  startTime: z.string().catch(''),
  expiredTime: z.string().catch(''),
  creator: z.string().catch(''),
})

const PackagesResponse = z.object({
  result: z
    .object({ instances: z.array(PackageInstance).catch([]) })
    .nullish()
    .catch(undefined),
})

const TpmInstance = z.object({
  instanceId: z.string().catch(''),
  model: z.string().catch(''),
  tpm: z.coerce.number().catch(0),
  status: z.string().catch(''),
  paymentTiming: z.string().catch(''),
})

const TpmResponse = z.object({
  result: z
    .object({ instances: z.array(TpmInstance).catch([]) })
    .nullish()
    .catch(undefined),
})

const MetricService = z.object({
  serviceId: z.string().optional(),
  tokens: z.coerce.number().nullish().catch(undefined),
  calls: z.coerce.number().nullish().catch(undefined),
})

const MetricResponse = z.object({
  result: z
    .object({ serviceList: z.array(MetricService).catch([]) })
    .nullish()
    .catch(undefined),
})

/** 三段响应 → 归一化数据（纯函数，供单测直接消费）。 */
export function parseQianfanData(
  packagesJson: unknown,
  tpmJson: unknown,
  metricJson: unknown,
): QianfanData {
  const packages = PackagesResponse.parse(packagesJson).result?.instances ?? []
  const tpmQuotas = TpmResponse.parse(tpmJson).result?.instances ?? []
  const serviceList = MetricResponse.parse(metricJson).result?.serviceList ?? []
  const usage = serviceList.reduce(
    (acc, svc) => ({
      serviceCount: acc.serviceCount + 1,
      totalTokens: acc.totalTokens + (svc.tokens ?? 0),
      totalCalls: acc.totalCalls + (svc.calls ?? 0),
    }),
    { serviceCount: 0, totalTokens: 0, totalCalls: 0 },
  )
  return { packages, tpmQuotas, usage }
}

/** ISO 时间精确到分（千帆用量接口要求：yyyy-MM-ddTHH:mm:00Z）。 */
function toMinutePrecision(date: Date): string {
  return `${date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .slice(0, 16)}:00Z`
}

/** 最近 N 天的窗口边界（UTC，精确到分，符合接口约束）。 */
function usageWindow(days: number): { startTime: string; endTime: string } {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  return { startTime: toMinutePrecision(start), endTime: toMinutePrecision(end) }
}

/**
 * 汇总查询：量包列表 + TPM 配额（ernie-speed-8k 代表性查询）+ 近 7 天调用概览。
 * 三路并行，任意一路失败即整体抛错（由 runAccounts 容错）。
 */
export async function fetchQianfanData(
  creds: BaiduCredentials,
  opts?: { usageDays?: number },
): Promise<QianfanData> {
  const days = Math.min(30, Math.max(1, opts?.usageDays ?? 7))
  const { startTime, endTime } = usageWindow(days)
  const [packagesJson, tpmJson, metricJson] = await Promise.all([
    qianfanCall(creds, 'DescribePackageResources', '/v2/charge', {}),
    qianfanCall(creds, 'DescribeTPMResource', '/v2/charge', { model: 'ernie-speed-8k' }),
    qianfanCall(creds, 'DescribeServiceMetric', '/v2/service', { startTime, endTime }),
  ])
  return parseQianfanData(packagesJson, tpmJson, metricJson)
}
