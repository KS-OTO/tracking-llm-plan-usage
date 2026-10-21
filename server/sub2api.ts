/**
 * Sub2API 用量查询（对齐 CC-Switch 的 Sub2API 内置模板）。
 *
 * - `GET {baseUrl}/v1/usage`，`Authorization: Bearer <API Key>`
 * - `baseUrl` 带不带 `/v1` 都可以：上游模板会先去掉尾部 `/` 与 `/v1` 再拼。
 * - 响应：`{ isValid, invalidMessage, remaining, planName, unit, status,
 *   quota: { limit, used, unit } }`
 *
 * 语义与模板保持一致：
 * - `remaining >= 0` 时展示为余额；订阅分组不限量时上游可能回 `-1`，此时不展示数字；
 * - 只有 `quota.limit > 0` 才展示「已用 / 总额」，避免不限量订阅出现负余额。
 */
import { z } from 'zod'

import { BalanceApiError, type SimpleBalanceInfo } from './balances.ts'

const REQUEST_TIMEOUT_MS = 15_000

const Sub2ApiBody = z.object({
  isValid: z.boolean().nullish(),
  invalidMessage: z.string().nullish(),
  remaining: z.coerce.number().nullish(),
  planName: z.string().nullish(),
  unit: z.string().nullish(),
  status: z.union([z.string(), z.number(), z.boolean()]).nullish(),
  quota: z
    .object({
      limit: z.coerce.number().nullish(),
      used: z.coerce.number().nullish(),
      unit: z.string().nullish(),
    })
    .nullish(),
})

/** 站点地址归一化：去掉尾部 `/` 与 `/v1`，保证两种写法得到同一个端点。 */
export function sub2ApiUsageUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (trimmed === '') {
    throw new BalanceApiError('InvalidConfig', 'SUB2API_BASE_URL 不能为空')
  }
  return `${trimmed.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/usage`
}

export function parseSub2ApiUsage(body: unknown): SimpleBalanceInfo {
  const parsed = Sub2ApiBody.safeParse(body)
  if (!parsed.success) {
    throw new BalanceApiError('InvalidResponse', 'Sub2API 响应结构无法解析')
  }
  const data = parsed.data
  if (data.isValid === false) {
    const reason =
      data.invalidMessage ??
      (data.status === null || data.status === undefined ? '查询失败' : String(data.status))
    throw new BalanceApiError('Sub2Api_Invalid', `Sub2API 账户不可用：${reason}`)
  }

  const limit = data.quota?.limit ?? null
  const used = data.quota?.used ?? null
  const remaining =
    typeof data.remaining === 'number' && data.remaining >= 0 ? data.remaining : null
  const balance = remaining ?? (limit !== null && limit > 0 ? limit - (used ?? 0) : null)
  // 不限量订阅可以只有套餐名 / 状态，没有数字余额；但整份空响应仍然算不认识
  const hasSignal =
    Boolean(data.planName) ||
    remaining !== null ||
    limit !== null ||
    (data.status !== null && data.status !== undefined)
  if (!hasSignal) {
    throw new BalanceApiError('InvalidResponse', 'Sub2API 响应缺少额度或套餐信息')
  }

  const unit = data.unit ?? data.quota?.unit ?? 'USD'
  return {
    provider: 'Sub2API',
    balance,
    unit,
    ...(limit !== null && limit > 0 ? { total: limit, ...(used !== null ? { used } : {}) } : {}),
    ...(data.planName ? { plan: data.planName } : {}),
    ...(data.status !== null && data.status !== undefined
      ? { meta: [{ label: '账户状态', value: String(data.status) }] }
      : {}),
  }
}

export async function fetchSub2ApiUsage(
  baseUrl: string,
  apiKey: string,
): Promise<SimpleBalanceInfo> {
  const url = sub2ApiUsageUrl(baseUrl)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new BalanceApiError('NetworkError', `Sub2API 请求失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BalanceApiError(
      res.ok ? 'InvalidResponse' : `Sub2Api_HTTP_${res.status}`,
      `Sub2API 响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok) {
    const envelope = z.object({ message: z.string().optional() }).safeParse(json)
    const detail = envelope.success && envelope.data.message ? `：${envelope.data.message}` : ''
    const message =
      res.status === 401
        ? 'Sub2API API Key 无效或已失效（HTTP 401）'
        : res.status === 403
          ? 'Sub2API 无权限或未开通订阅（HTTP 403）'
          : `Sub2API 请求失败（HTTP ${res.status}）${detail}`
    throw new BalanceApiError(`Sub2Api_HTTP_${res.status}`, message)
  }
  return parseSub2ApiUsage(json)
}
