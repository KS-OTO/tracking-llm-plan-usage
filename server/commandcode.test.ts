import { describe, expect, it } from 'vite-plus/test'

import { parseCommandCodeQuota } from './commandcode.ts'

const credits = {
  credits: {
    planId: 'provider',
    monthlyCredits: 12.5,
    purchasedCredits: 3,
    freeCredits: 0.5,
    windowLimits: {
      limited: true,
      fiveHour: { used: 4, cap: 14, resetAt: '2026-09-12T18:00:00.000Z' },
      weekly: { used: 12, cap: 40, resetAt: '2026-09-16T00:00:00.000Z' },
    },
  },
}

const subscription = {
  data: {
    planId: 'goat',
    status: 'active',
    currentPeriodStart: '2026-09-01T00:00:00.000Z',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
  },
}

describe('parseCommandCodeQuota', () => {
  it('maps rolling windows and the billing-period pool', () => {
    const result = parseCommandCodeQuota(credits, subscription, { totalCost: 7 })

    expect(result.provider).toBe('Command Code')
    expect(result.plan).toBe('goat')
    expect(result.windows).toHaveLength(3)
    expect(result.windows[0]).toMatchObject({
      window: 'fiveHour',
      unit: 'credits',
      used: 4,
      total: 14,
    })
    expect(result.windows[0]?.percent).toBeCloseTo((4 / 14) * 100)
    expect(result.windows[1]).toMatchObject({ window: 'weekly', percent: 30 })
    expect(result.balance).toEqual({ remaining: 16, unit: 'credits', label: 'Credit balance' })
    // 月度池 = 已用 7 + 剩余 (12.5 + 3 + 0.5)
    expect(result.windows[2]).toMatchObject({
      window: 'monthly',
      used: 7,
      total: 23,
      resetTime: Date.parse('2026-10-01T00:00:00.000Z'),
    })
    expect(result.windows[2]?.percent).toBeCloseTo((7 / 23) * 100)
  })

  it('keeps pay-as-you-go accounts to a single monthly tier', () => {
    const result = parseCommandCodeQuota(
      {
        credits: {
          planId: 'provider',
          monthlyCredits: 0,
          purchasedCredits: 18.25,
          freeCredits: 0,
          windowLimits: { limited: false },
        },
      },
      null,
      { totalCost: 0 },
    )

    expect(result.plan).toBe('provider')
    expect(result.windows.map((window) => window.window)).toEqual(['monthly'])
    expect(result.balance?.remaining).toBe(18.25)
  })

  it('drops malformed windows and zero-valued reset placeholders', () => {
    const result = parseCommandCodeQuota(
      {
        credits: {
          monthlyCredits: 1,
          purchasedCredits: 0,
          freeCredits: 0,
          windowLimits: {
            limited: true,
            fiveHour: { used: 1, cap: 0, resetAt: 0 },
            weekly: { used: 1, cap: 10, resetAt: 0 },
          },
        },
      },
      null,
      { totalCost: 1 },
    )

    expect(result.windows.map((window) => window.window)).toEqual(['weekly', 'monthly'])
    expect(result.windows[0]?.resetTime).toBe(0)
  })

  it('rejects a response without credits', () => {
    expect(() => parseCommandCodeQuota({}, null, {})).toThrow('credits')
  })

  it('keeps windows and balance when the usage summary is unavailable', () => {
    const result = parseCommandCodeQuota(credits, null, {})

    expect(result.windows.map((window) => window.window)).toEqual(['fiveHour', 'weekly'])
    expect(result.balance?.remaining).toBe(16)
  })
})
