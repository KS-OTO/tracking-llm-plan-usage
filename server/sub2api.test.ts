import { describe, expect, it } from 'vite-plus/test'

import { parseSub2ApiUsage, sub2ApiUsageUrl } from './sub2api.ts'

describe('sub2ApiUsageUrl', () => {
  it('accepts a base URL with or without /v1 and trailing slashes', () => {
    for (const base of [
      'https://sub.example.com',
      'https://sub.example.com/',
      'https://sub.example.com/v1',
      'https://sub.example.com/v1/',
    ]) {
      expect(sub2ApiUsageUrl(base)).toBe('https://sub.example.com/v1/usage')
    }
  })

  it('rejects an empty base URL', () => {
    expect(() => sub2ApiUsageUrl('   ')).toThrow('SUB2API_BASE_URL')
  })
})

describe('parseSub2ApiUsage', () => {
  it('uses remaining, total and used from a limited subscription', () => {
    const result = parseSub2ApiUsage({
      isValid: true,
      remaining: 12.5,
      planName: 'Pro',
      unit: 'USD',
      status: 'active',
      quota: { limit: 20, used: 7.5, unit: 'USD' },
    })

    expect(result).toMatchObject({
      provider: 'Sub2API',
      balance: 12.5,
      total: 20,
      used: 7.5,
      unit: 'USD',
      plan: 'Pro',
    })
    expect(result.meta).toEqual([{ label: '账户状态', value: 'active' }])
  })

  it('omits the amount pair for unlimited groups (remaining = -1)', () => {
    const result = parseSub2ApiUsage({ remaining: -1, planName: 'Unlimited', quota: { limit: 0 } })

    expect(result.balance).toBeNull()
    expect(result.total).toBeUndefined()
    expect(result.used).toBeUndefined()
    expect(result.plan).toBe('Unlimited')
  })

  it('derives the balance from limit - used when remaining is absent', () => {
    expect(parseSub2ApiUsage({ quota: { limit: 10, used: 4 } }).balance).toBe(6)
  })

  it('turns an invalid account into a domain error with the upstream reason', () => {
    expect(() => parseSub2ApiUsage({ isValid: false, invalidMessage: 'key disabled' })).toThrow(
      'key disabled',
    )
    expect(() => parseSub2ApiUsage({ isValid: false, status: 'expired' })).toThrow('expired')
  })

  it('rejects an empty response instead of rendering an empty card', () => {
    expect(() => parseSub2ApiUsage({})).toThrow('额度或套餐信息')
    expect(() => parseSub2ApiUsage('nonsense')).toThrow('无法解析')
  })
})
