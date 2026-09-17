import { describe, expect, it } from 'vite-plus/test'

import { parseOpenRouterBalance, parseOpenRouterDetail } from './balances.ts'

describe('parseOpenRouterBalance', () => {
  it('computes remaining credits from total minus usage', () => {
    const result = parseOpenRouterBalance({ data: { total_credits: 10, total_usage: 3.5 } })

    expect(result).toMatchObject({ balance: 6.5, total: 10, used: 3.5, unit: 'USD' })
  })

  it('falls back to the top-level object when data is absent', () => {
    expect(parseOpenRouterBalance({ total_credits: 5, total_usage: 1 }).balance).toBe(4)
  })

  it('tolerates a response that only carries one of the two fields', () => {
    // 字段级容错是**有意**的：缺哪个补 0，而不是整份响应作废
    expect(parseOpenRouterBalance({ data: { total_credits: 5 } })).toMatchObject({
      total: 5,
      used: 0,
      balance: 5,
    })
  })

  it('throws a domain error instead of leaking a ZodError', () => {
    // 字段级容错若没有「像不像 credits」这道闸兜住，`{nope:true}` 会被解析成
    // 「余额 0.00」—— 用户会以为账户被清零，而不是「这份响应不认识」
    for (const body of [{ nope: true }, {}, 'nonsense', null, 42, []]) {
      expect(() => parseOpenRouterBalance(body)).toThrow('响应结构无法解析')
    }
  })
})

describe('parseOpenRouterDetail', () => {
  it('merges the credits view with the key metadata', () => {
    const detail = parseOpenRouterDetail(
      { data: { total_credits: 20, total_usage: 5 } },
      {
        data: {
          label: '主力号',
          is_free_tier: false,
          is_management_key: true,
          limit: 50,
          limit_remaining: 12.5,
          limit_reset: 'monthly',
          expires_at: null,
          usage: 5,
          usage_daily: 0.5,
          usage_weekly: 2,
          usage_monthly: 5,
        },
      },
    )

    expect(detail).toMatchObject({
      balance: 15,
      label: '主力号',
      isManagementKey: true,
      limit: 50,
      limitRemaining: 12.5,
      limitReset: 'monthly',
      usageDaily: 0.5,
      usageWeekly: 2,
      usageMonthly: 5,
    })
  })

  it('degrades to credits-only fields when the key endpoint answers with garbage', () => {
    // `/api/v1/key` 可能被站点策略挡掉（403 之类），此时余额照常给出，其余字段取中性值
    const detail = parseOpenRouterDetail({ data: { total_credits: 8, total_usage: 3 } }, 'nonsense')

    expect(detail).toMatchObject({
      balance: 5,
      label: '',
      isFreeTier: false,
      isManagementKey: false,
      limit: null,
      limitRemaining: null,
      usageMonthly: 0,
    })
  })
})
