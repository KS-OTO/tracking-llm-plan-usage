import { describe, expect, it } from 'vite-plus/test'

import {
  normalizeSiliconFlowSite,
  parseNovitaBalance,
  parseOpenRouterBalance,
  parseOpenRouterDetail,
  parseSiliconFlowBalance,
  parseStepFunBalance,
} from './balances.ts'

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

describe('parseStepFunBalance', () => {
  it('uses the total balance and exposes cash / voucher dimensions', () => {
    const result = parseStepFunBalance({
      balance: 12.34,
      total_cash_balance: 10,
      total_voucher_balance: 2.34,
    })

    expect(result).toMatchObject({ provider: 'StepFun', balance: 12.34, unit: 'CNY' })
    expect(result.details).toEqual([
      { key: 'cash', label: '现金余额', value: 10, unit: 'CNY' },
      { key: 'voucher', label: '代金券余额', value: 2.34, unit: 'CNY' },
    ])
  })

  it('derives the balance from cash + voucher when balance is absent', () => {
    expect(parseStepFunBalance({ total_cash_balance: 3, total_voucher_balance: 4 }).balance).toBe(7)
  })

  it('rejects a response without any balance field instead of showing zero', () => {
    expect(() => parseStepFunBalance({ object: 'account' })).toThrow('balance')
  })
})

describe('parseSiliconFlowBalance', () => {
  it('reads totalBalance and keeps recharge / granted dimensions', () => {
    const result = parseSiliconFlowBalance(
      { data: { totalBalance: 8.5, balance: 5, chargeBalance: 3.5, status: 'normal' } },
      'cn',
    )

    expect(result).toMatchObject({ provider: 'SiliconFlow', balance: 8.5, unit: 'CNY' })
    expect(result.meta).toEqual([{ label: '账户状态', value: 'normal' }])
    expect(result.details?.map((item) => item.key)).toEqual(['recharge', 'granted'])
  })

  it('labels the international site and uses USD', () => {
    const result = parseSiliconFlowBalance({ data: { totalBalance: 1.25 } }, 'global')

    expect(result).toMatchObject({ provider: 'SiliconFlow（国际站）', unit: 'USD' })
  })

  it('rejects a response without data', () => {
    expect(() => parseSiliconFlowBalance({ code: 401 }, 'cn')).toThrow('data')
  })
})

describe('normalizeSiliconFlowSite', () => {
  it('defaults to cn and accepts the known aliases', () => {
    expect(normalizeSiliconFlowSite(undefined)).toBe('cn')
    expect(normalizeSiliconFlowSite('CN')).toBe('cn')
    expect(normalizeSiliconFlowSite('global')).toBe('global')
    expect(normalizeSiliconFlowSite('en')).toBe('global')
  })

  it('rejects an unknown site instead of silently querying the wrong one', () => {
    expect(() => normalizeSiliconFlowSite('global-en')).toThrow('SILICONFLOW_SITE')
  })
})

describe('parseNovitaBalance', () => {
  it('converts the 0.0001 USD unit and exposes cash / credit dimensions', () => {
    const result = parseNovitaBalance({
      availableBalance: 123456,
      cashBalance: 100000,
      creditLimit: 23456,
      outstandingInvoices: 0,
    })

    expect(result).toMatchObject({ provider: 'Novita AI', balance: 12.3456, unit: 'USD' })
    expect(result.details).toEqual([
      { key: 'cash', label: '现金余额', value: 10, unit: 'USD' },
      { key: 'credit', label: '信用额度', value: 2.3456, unit: 'USD' },
      { key: 'outstanding', label: '待付账单', value: 0, unit: 'USD' },
    ])
  })

  it('rejects a response without availableBalance', () => {
    expect(() => parseNovitaBalance({ cashBalance: 1 })).toThrow('availableBalance')
  })
})
