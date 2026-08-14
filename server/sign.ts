/**
 * Volcengine (火山引擎) API v4 request signing.
 *
 * Algorithm documented at:
 * https://www.volcengine.com/docs/6369/67269 (签名方法)
 *
 * Service/region for Ark control-plane APIs: service = "ark", region = "cn-beijing".
 * Ark control-plane requests additionally sign the `x-content-sha256` header
 * (see GetAFPUsage / GetUsageDetails request examples).
 *
 * 使用 Web Crypto（crypto.subtle）实现，兼容 Bun / Node 18+ / Cloudflare Workers。
 */

export const VOLC_SIGNATURE_ALGORITHM = 'HMAC-SHA256'

const textEncoder = new TextEncoder()

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: Uint8Array | string, input: string): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? textEncoder.encode(key) : new Uint8Array(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(input))
  return new Uint8Array(signature)
}

/** RFC 3986 percent-encoding: unreserved chars kept, hex uppercase. */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

export interface VolcSignInput {
  accessKey: string
  secretKey: string
  method: 'GET' | 'POST'
  host: string
  path?: string
  query?: Record<string, string>
  body?: string
  region?: string
  service?: string
  now?: Date
  /** Extra header values included in the signed headers (e.g. x-content-sha256). */
  extraHeaders?: Record<string, string>
}

export interface VolcSignResult {
  xDate: string
  /** Full header map to send with the request (includes `authorization`). */
  headers: Record<string, string>
  authorization: string
  signedHeaders: string
  canonicalRequestHash: string
}

export async function signVolcRequest(input: VolcSignInput): Promise<VolcSignResult> {
  const {
    accessKey,
    secretKey,
    method,
    host,
    region = 'cn-beijing',
    service,
    now = new Date(),
  } = input
  const path = input.path ?? '/'
  const body = input.body ?? ''
  if (!service) {
    throw new Error('signVolcRequest: service is required')
  }

  // 2025-03-29T18:09:37.000Z -> 20250329T180937Z
  const xDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const shortDate = xDate.slice(0, 8)

  const payloadHash = await sha256Hex(body)

  // Canonical headers: lowercase names, sorted, values trimmed.
  const headerValues: Record<string, string> = {
    host,
    'x-date': xDate,
    ...input.extraHeaders,
  }
  const names = Object.keys(headerValues).sort()
  const canonicalHeaders = names.map((name) => `${name}:${headerValues[name]!.trim()}\n`).join('')
  const signedHeaders = names.join(';')

  const queryString = Object.entries(input.query ?? {})
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .sort()
    .join('&')

  const canonicalRequest = [
    method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const canonicalRequestHash = await sha256Hex(canonicalRequest)

  const credentialScope = `${shortDate}/${region}/${service}/request`
  const stringToSign = [
    VOLC_SIGNATURE_ALGORITHM,
    xDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n')

  let key: Uint8Array = await hmacSha256(textEncoder.encode(secretKey), shortDate)
  key = await hmacSha256(key, region)
  key = await hmacSha256(key, service)
  key = await hmacSha256(key, 'request')

  const signature = Array.from(await hmacSha256(key, stringToSign))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const authorization = `${VOLC_SIGNATURE_ALGORITHM} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    xDate,
    headers: { ...headerValues, authorization },
    authorization,
    signedHeaders,
    canonicalRequestHash,
  }
}
