import { describe, expect, it } from 'vite-plus/test'

import { formatMoney, formatReset, formatTokens, maskKey, ratioOf } from '../utils'

describe('maskKey', () => {
  it('keeps only the first and last 4 characters', () => {
    expect(maskKey('sk-0123456789abcdef')).toBe('sk-0****cdef')
  })

  it('masks short keys entirely', () => {
    expect(maskKey('abcdefgh')).toBe('****')
    expect(maskKey('abc')).toBe('****')
  })
})

describe('formatTokens', () => {
  it('formats small counts plainly', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('compresses thousands, millions and billions', () => {
    expect(formatTokens(12_500)).toBe('12.5K')
    expect(formatTokens(1_200_000)).toBe('1.20M')
    expect(formatTokens(3_400_000_000)).toBe('3.40B')
  })
})

describe('ratioOf', () => {
  it('computes percentage capped at 100', () => {
    expect(ratioOf(25, 100)).toBe(25)
    expect(ratioOf(150, 100)).toBe(100)
  })

  it('returns 0 for zero quota', () => {
    expect(ratioOf(10, 0)).toBe(0)
  })
})

describe('formatMoney', () => {
  it('formats with two decimals and currency', () => {
    expect(formatMoney(12.345, 'CNY')).toBe('12.35 CNY')
  })
})

describe('formatReset', () => {
  it('shows a dash for non-applicable windows', () => {
    expect(formatReset(-1)).toBe('—')
    expect(formatReset(0)).toBe('—')
  })

  it('reports past timestamps as reset', () => {
    expect(formatReset(Date.now() - 1000)).toBe('已重置')
  })

  it('reports hours and minutes until reset', () => {
    const in90Minutes = Date.now() + 90 * 60_000
    expect(formatReset(in90Minutes)).toMatch(/^1 小时 3\d 分后重置$/)
  })

  it('reports days for far away resets', () => {
    const in3Days = Date.now() + 3 * 24 * 3_600_000
    expect(formatReset(in3Days)).toBe('3 天后重置')
  })
})
