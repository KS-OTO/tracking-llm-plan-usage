import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { formatMoney, formatReset, formatTokens, maskKey, progressStatus, ratioOf } from '../utils'

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
  // formatReset 内部会重新采样时钟，与用例构造时间戳时存在毫秒级间隙；
  // `Date.now() + 90 * 60_000` 恰好落在分钟边界上，慢机器上会从 30 分抖到 29 分。
  // 用假时钟钉住系统时间，让断言对宿主速度不敏感。
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a dash for non-applicable windows', () => {
    expect(formatReset(-1)).toBe('—')
    expect(formatReset(0)).toBe('—')
  })

  it('reports past timestamps as reset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(formatReset(Date.now() - 1000)).toBe('已重置')
  })

  it('reports hours and minutes until reset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(formatReset(Date.now() + 90 * 60_000)).toBe('1 小时 30 分后重置')
  })

  it('reports days for far away resets', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(formatReset(Date.now() + 3 * 24 * 3_600_000)).toBe('3 天后重置')
  })
})

describe('progressStatus', () => {
  it('maps healthy usage to success', () => {
    expect(progressStatus(0)).toBe('success')
    expect(progressStatus(69.9)).toBe('success')
  })

  it('maps heavy usage to warning', () => {
    expect(progressStatus(70)).toBe('warning')
    expect(progressStatus(89.9)).toBe('warning')
  })

  it('maps critical usage to error (desktop Progress has no danger)', () => {
    expect(progressStatus(90)).toBe('error')
    expect(progressStatus(100)).toBe('error')
  })
})
