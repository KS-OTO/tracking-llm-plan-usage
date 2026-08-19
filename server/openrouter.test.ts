import { describe, expect, it } from 'vite-plus/test'

import { parseOpenRouterDetail } from './balances.ts'

/** 样本取自官方文档（credits + key 端点响应示例）与真实实测。 */
describe('parseOpenRouterDetail', () => {
  it('merges credits and key metadata into the full view', () => {
    const result = parseOpenRouterDetail(
      { data: { total_credits: 100.5, total_usage: 25.75 } },
      {
        data: {
          label: 'sk-or-v1-au7...890',
          is_free_tier: false,
          is_management_key: false,
          limit: 100,
          limit_remaining: 74.5,
          limit_reset: 'monthly',
          expires_at: '2027-12-31T23:59:59Z',
          usage: 25.5,
          usage_daily: 1.5,
          usage_weekly: 10.25,
          usage_monthly: 25.5,
          byok_usage: 0,
          byok_usage_daily: 0,
          byok_usage_weekly: 0,
          byok_usage_monthly: 0,
          creator_user_id: 'user_x',
          include_byok_in_limit: false,
          is_provisioning_key: false,
          rate_limit: { requests: 1000, interval: '1h', note: 'deprecated' },
        },
      },
    )
    expect(result.balance).toBe(74.75)
    expect(result.total).toBe(100.5)
    expect(result.used).toBe(25.75)
    expect(result.unit).toBe('USD')
    expect(result.label).toBe('sk-or-v1-au7...890')
    expect(result.isFreeTier).toBe(false)
    expect(result.limit).toBe(100)
    expect(result.limitRemaining).toBe(74.5)
    expect(result.limitReset).toBe('monthly')
    expect(result.expiresAt).toBe('2027-12-31T23:59:59Z')
    expect(result.usageDaily).toBe(1.5)
    expect(result.usageWeekly).toBe(10.25)
    expect(result.usageMonthly).toBe(25.5)
  })

  it('handles free-tier key without limit (real-world sample)', () => {
    const result = parseOpenRouterDetail(
      { data: { total_credits: 0, total_usage: 0 } },
      {
        data: {
          label: 'sk-or-v1-23a...d7f',
          is_free_tier: true,
          is_management_key: false,
          limit: null,
          limit_remaining: null,
          limit_reset: null,
          expires_at: null,
          usage: 0,
          usage_daily: 0,
          usage_weekly: 0,
          usage_monthly: 0,
        },
      },
    )
    expect(result.balance).toBe(0)
    expect(result.isFreeTier).toBe(true)
    expect(result.limit).toBe(null)
    expect(result.limitRemaining).toBe(null)
    expect(result.limitReset).toBe(null)
    expect(result.expiresAt).toBe(null)
  })

  it('degrades gracefully when key endpoint returns unexpected shape', () => {
    const result = parseOpenRouterDetail(
      { data: { total_credits: 10, total_usage: 2 } },
      { error: { code: 500, message: 'boom' } },
    )
    expect(result.balance).toBe(8)
    expect(result.isFreeTier).toBe(false)
    expect(result.label).toBe('')
    expect(result.usageMonthly).toBe(0)
  })
})
