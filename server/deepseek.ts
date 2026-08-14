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

/**
 * GET https://api.deepseek.com/user/balance
 * Docs: https://api-docs.deepseek.com/zh-cn/api/get-user-balance/
 */
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
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new DeepSeekApiError(
      res.status,
      'InvalidResponse',
      `响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  const body = json as {
    is_available?: boolean
    balance_infos?: Array<{
      currency?: string
      total_balance?: string
      granted_balance?: string
      topped_up_balance?: string
    }>
    error?: { message?: string }
  }

  if (!res.ok) {
    throw new DeepSeekApiError(
      res.status,
      `DeepSeek_${res.status}`,
      body.error?.message ?? text.slice(0, 200),
    )
  }

  return {
    isAvailable: body.is_available ?? false,
    balances: (body.balance_infos ?? []).map((entry) => ({
      currency: entry.currency ?? 'CNY',
      total: Number(entry.total_balance ?? 0),
      granted: Number(entry.granted_balance ?? 0),
      toppedUp: Number(entry.topped_up_balance ?? 0),
    })),
  }
}
