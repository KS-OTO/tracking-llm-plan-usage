import { describe, expect, it } from 'vite-plus/test'

import { parseZenMuxPlan } from './zenmux.ts'

describe('parseZenMuxPlan', () => {
  it('converts usage_percentage to percent and keeps USD amounts', () => {
    const result = parseZenMuxPlan({
      success: true,
      data: {
        quota_5_hour: {
          usage_percentage: 0.35,
          resets_at: '2026-09-12T18:00:00.000Z',
          used_value_usd: 3.5,
          max_value_usd: 10,
        },
        quota_7_day: {
          usage_percentage: 0.2,
          resets_at: '2026-09-16T00:00:00.000Z',
          used_value_usd: 8,
          max_value_usd: 40,
        },
        plan: { tier: 'pro' },
        account_status: 'active',
      },
    })

    expect(result.provider).toBe('ZenMux')
    expect(result.plan).toBe('pro (active)')
    expect(result.windows).toEqual([
      {
        window: 'fiveHour',
        percent: 35,
        resetTime: Date.parse('2026-09-12T18:00:00.000Z'),
        used: 3.5,
        total: 10,
        unit: 'USD',
      },
      {
        window: 'weekly',
        percent: 20,
        resetTime: Date.parse('2026-09-16T00:00:00.000Z'),
        used: 8,
        total: 40,
        unit: 'USD',
      },
    ])
  })

  it('reports a business error instead of rendering an empty card', () => {
    expect(() => parseZenMuxPlan({ success: false, message: 'quota endpoint moved' })).toThrow(
      'quota endpoint moved',
    )
  })

  it('rejects a response without a recognizable window', () => {
    expect(() => parseZenMuxPlan({ success: true, data: {} })).toThrow('额度窗口')
  })
})
