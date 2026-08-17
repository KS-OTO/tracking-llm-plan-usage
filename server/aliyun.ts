/**
 * 阿里云 RPC OpenAPI 签名与 BSS（费用中心）资源包查询。
 *
 * - QueryResourcePackageInstances:
 *   https://help.aliyun.com/zh/bssopenapi/developer-reference/api-bssopenapi-2017-12-14-queryresourcepackageinstances
 * - RPC 签名机制（HMAC-SHA1）：参数名 ASCII 排序 -> RFC3986 编码 -> StringToSign
 * - 字段结构取自官方 Go/Python SDK（alibaba-cloud-sdk-go services/bssopenapi）。
 * - 使用 Web Crypto（crypto.subtle），兼容 Bun / Node 20+ / Cloudflare Workers。
 */
import { z } from 'zod'

const textEncoder = new TextEncoder()

async function hmacSha1(key: string, input: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(input))
  return new Uint8Array(signature)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** RFC 3986 percent-encoding（大写十六进制，保留 -_.~）。 */
export function aliyunEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

/**
 * 构造阿里云 RPC 待签名字符串：
 * `POST&%2F&<规范查询串>`，规范查询串 = 参数名 ASCII 排序 + RFC3986 编码 + & 连接。
 * 文档示例（DescribeRegions）的规范串：
 * AccessKeyId%3Dtestid%26Action%3DDescribeRegions%26Format%3DXML%26SignatureMethod%3DHMAC-SHA1%26SignatureNonce%3D3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf%26SignatureVersion%3D1.0%26Timestamp%3D2016-02-23T12%253A46%253A24Z%26Version%3D2014-05-26
 */
export function aliyunStringToSign(params: Record<string, string>): string {
  const canonicalQuery = Object.entries(params)
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${aliyunEncode(key)}=${aliyunEncode(value)}`)
    .join('&')

  return `POST&${aliyunEncode('/')}&${aliyunEncode(canonicalQuery)}`
}

/**
 * 计算阿里云 RPC 签名（base64 HMAC-SHA1，密钥为 `SecretKey&`）。
 */
export async function signAliyunRpc(
  params: Record<string, string>,
  secretKey: string,
): Promise<string> {
  return toBase64(await hmacSha1(`${secretKey}&`, aliyunStringToSign(params)))
}

/**
 * 计算阿里云 ROA 签名（新版 OpenAPI，密钥为裸 SecretKey）。
 *
 * 算法取自官方 SDK（darabonba-openapi/v2/utils getSignedStr）：
 * StringToSign = Method + "\n" + Accept + "\n" + ContentMD5 + "\n" + ContentType + "\n"
 *                + Date + "\n" + CanonicalizedHeaders(仅 x-acs-*，按名排序) + CanonicalizedResource(path?query)
 * 已用真实网关验证（modelstudio.cn-beijing.aliyuncs.com，SignatureDoesNotMatch 逐项对齐后返回 200）。
 */
export async function signAliyunRoa(opts: {
  method: string
  path: string
  query?: Record<string, string>
  xAcsHeaders: Record<string, string>
  date: string
  secretKey: string
}): Promise<string> {
  const canonicalHeaders =
    Object.keys(opts.xAcsHeaders)
      .toSorted()
      .map((name) => `${name}:${opts.xAcsHeaders[name]}`)
      .join('\n') + '\n'

  const queryEntries = Object.entries(opts.query ?? {}).toSorted(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  const canonicalQuery = queryEntries.map(([key, value]) => `${key}=${value}`).join('&')
  const resource = opts.path + (canonicalQuery ? `?${canonicalQuery}` : '')

  const stringToSign = `${opts.method}\napplication/json\n\n\n${opts.date}\n${canonicalHeaders}${resource}`
  return toBase64(await hmacSha1(opts.secretKey, stringToSign))
}

export interface AliyunCredentials {
  accessKey: string
  secretKey: string
}

export class AliyunApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface AliyunResourcePackage {
  instanceId: string
  commodityCode: string
  packageType: string
  region: string
  status: string
  effectiveTime: string
  expiryTime: string
  totalAmount: string
  totalAmountUnit: string
  remainingAmount: string
  remainingAmountUnit: string
  remark: string
  applicableProducts: string[]
}

export interface AliyunPackagesResult {
  packages: AliyunResourcePackage[]
  totalCount: number
}

const BssInstance = z.object({
  InstanceId: z.string().catch(''),
  CommodityCode: z.string().catch(''),
  PackageType: z.string().catch(''),
  Region: z.string().catch(''),
  Status: z.string().catch(''),
  EffectiveTime: z.string().catch(''),
  ExpiryTime: z.string().catch(''),
  TotalAmount: z.string().catch(''),
  TotalAmountUnit: z.string().catch(''),
  RemainingAmount: z.string().catch(''),
  RemainingAmountUnit: z.string().catch(''),
  Remark: z.string().catch(''),
  ApplicableProducts: z
    .object({
      Product: z.array(z.object({ ProductCode: z.string().catch('') })).catch([]),
    })
    .optional()
    .catch(undefined),
})

const BssResponse = z.object({
  Success: z.boolean().catch(false),
  Code: z.string().optional(),
  Message: z.string().optional(),
  Data: z
    .object({
      TotalCount: z.coerce.number().catch(0),
      Instances: z
        .object({
          Instance: z.array(BssInstance).catch([]),
        })
        .optional(),
    })
    .optional(),
})

export async function queryResourcePackageInstances(
  creds: AliyunCredentials,
  opts?: { productCode?: string; pageSize?: number },
): Promise<AliyunPackagesResult> {
  const now = new Date()
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z')

  const params: Record<string, string> = {
    AccessKeyId: creds.accessKey,
    Action: 'QueryResourcePackageInstances',
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: timestamp,
    Version: '2017-12-14',
    PageSize: String(opts?.pageSize ?? 100),
  }
  if (opts?.productCode) {
    params.ProductCode = opts.productCode
  }

  const signature = await signAliyunRpc(params, creds.secretKey)

  let res: Response
  try {
    res = await fetch('https://business.aliyuncs.com/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, Signature: signature }).toString(),
    })
  } catch (cause) {
    throw new AliyunApiError('NetworkError', `请求阿里云 BSS 失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AliyunApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }

  const parsed = BssResponse.safeParse(json)
  if (!parsed.success) {
    throw new AliyunApiError('InvalidResponse', `响应结构无法解析: ${text.slice(0, 200)}`)
  }
  const body = parsed.data

  if (!body.Success) {
    throw new AliyunApiError(body.Code ?? `HTTP_${res.status}`, body.Message ?? text.slice(0, 200))
  }

  const packages: AliyunResourcePackage[] = (body.Data?.Instances?.Instance ?? []).map(
    (instance) => ({
      instanceId: instance.InstanceId,
      commodityCode: instance.CommodityCode,
      packageType: instance.PackageType,
      region: instance.Region,
      status: instance.Status,
      effectiveTime: instance.EffectiveTime,
      expiryTime: instance.ExpiryTime,
      totalAmount: instance.TotalAmount,
      totalAmountUnit: instance.TotalAmountUnit,
      remainingAmount: instance.RemainingAmount,
      remainingAmountUnit: instance.RemainingAmountUnit,
      remark: instance.Remark,
      applicableProducts: (instance.ApplicableProducts?.Product ?? []).map(
        (product) => product.ProductCode,
      ),
    }),
  )

  return {
    packages,
    totalCount: body.Data?.TotalCount ?? packages.length,
  }
}
