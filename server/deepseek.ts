/**
 * DeepSeek 余额客户端。
 *
 * GET https://api.deepseek.com/user/balance
 * Docs: https://api-docs.deepseek.com/zh-cn/api/get-user-balance/
 */
import { z } from 'zod'

export interface DeepSeekBalanceEntry {
  currency: string
  total: number
  granted: number
  toppedUp: number
}

export interface DeepSeekBalance {
  isAvailable: boolean
  balances: DeepSeekBalanceEntry[]
}

export class DeepSeekApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 供应商响应 schema：字段宽容降级（缺失/类型不符 → 默认值），顶层必须是对象。 */
const DeepSeekResponse = z.object({
  is_available: z.boolean().catch(false),
  balance_infos: z
    .array(
      z
        .object({
          currency: z.string().catch('CNY'),
          total_balance: z.coerce.number().catch(0),
          granted_balance: z.coerce.number().catch(0),
          topped_up_balance: z.coerce.number().catch(0),
        })
        .nullish(),
    )
    .catch([]),
  error: z.union([z.object({ message: z.string().optional() }), z.string()]).optional(),
})

export async function fetchDeepSeekBalance(apiKey: string): Promise<DeepSeekBalance> {
  const res = await fetch('https://api.deepseek.com/user/balance', {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
  })
  const text = await res.text()

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new DeepSeekApiError(
      res.status,
      'InvalidResponse',
      `响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }
  const parsed = DeepSeekResponse.safeParse(json)
  if (!parsed.success) {
    throw new DeepSeekApiError(
      res.status,
      'InvalidResponse',
      `响应结构无法解析: ${text.slice(0, 200)}`,
    )
  }
  const body = parsed.data
  const embeddedError = typeof body.error === 'string' ? body.error : body.error?.message

  if (!res.ok) {
    throw new DeepSeekApiError(
      res.status,
      `DeepSeek_${res.status}`,
      embeddedError ?? text.slice(0, 200),
    )
  }
  // 部分网关以 HTTP 200 携带错误信封：显式失败而非展示假零值
  if (embeddedError) {
    throw new DeepSeekApiError(res.status, 'DeepSeek_BUSINESS', embeddedError)
  }

  return {
    isAvailable: body.is_available,
    balances: body.balance_infos
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry !== undefined)
      .map((entry) => ({
        currency: entry.currency,
        total: entry.total_balance,
        granted: entry.granted_balance,
        toppedUp: entry.topped_up_balance,
      })),
  }
}
