import { describe, expect, it } from 'vite-plus/test'

import { OpenCodeApiError, parseOpenCodeGoUsage } from './opencode.ts'

// 契约来源：cc-switch PR #6547 —— GET {baseUrl}/usage → usage.rolling/weekly/monthly，
// 每窗口 { percent, resetsAt }；percent 直接是「已用百分比」。
const ISO_ROLLING = '2026-09-14T10:59:30.000Z'
const ISO_WEEKLY = '2026-09-20T09:00:00.000Z'
const ISO_MONTHLY = '2026-10-05T13:30:00.000Z'

describe('parseOpenCodeGoUsage', () => {
  it('maps rolling/weekly/monthly to 5h/7d/30d windows in order', () => {
    const result = parseOpenCodeGoUsage({
      usage: {
        rolling: { percent: 0, resetsAt: ISO_ROLLING },
        weekly: { percent: 19, resetsAt: ISO_WEEKLY },
        monthly: { percent: 5, resetsAt: ISO_MONTHLY },
      },
    })

    expect(result.provider).toBe('OpenCode Go')
    expect(result.windows).toEqual([
      { window: 'fiveHour', percent: 0, resetTime: Date.parse(ISO_ROLLING) },
      { window: 'weekly', percent: 19, resetTime: Date.parse(ISO_WEEKLY) },
      { window: 'monthly', percent: 5, resetTime: Date.parse(ISO_MONTHLY) },
    ])
  })

  it('skips windows the subscription does not include', () => {
    const result = parseOpenCodeGoUsage({
      usage: { rolling: { percent: 10, resetsAt: ISO_ROLLING }, monthly: { percent: 1 } },
    })

    expect(result.windows.map((item) => item.window)).toEqual(['fiveHour', 'monthly'])
  })

  it('returns no windows when usage is absent', () => {
    expect(parseOpenCodeGoUsage({}).windows).toEqual([])
    expect(parseOpenCodeGoUsage({ usage: null }).windows).toEqual([])
  })

  it('clamps out-of-range percentages and falls back to 0', () => {
    const result = parseOpenCodeGoUsage({
      usage: {
        rolling: { percent: 150, resetsAt: ISO_ROLLING },
        weekly: { percent: -8, resetsAt: ISO_WEEKLY },
        monthly: { resetsAt: ISO_MONTHLY },
      },
    })

    // percent 缺失 → 0（窗口仍展示，不隐藏）
    expect(result.windows.map((item) => item.percent)).toEqual([100, 0, 0])
  })

  it('tolerates string percentages and epoch-second resetsAt', () => {
    const result = parseOpenCodeGoUsage({
      usage: { rolling: { percent: '73.5', resetsAt: 1_789_371_600 } },
    })

    // 10 位秒级时间戳换算为毫秒，而不是当成 1970 年
    expect(result.windows).toEqual([
      { window: 'fiveHour', percent: 73.5, resetTime: 1_789_371_600_000 },
    ])
  })

  it('keeps epoch-millisecond resetsAt untouched', () => {
    const ms = 1_789_371_600_000
    const result = parseOpenCodeGoUsage({ usage: { weekly: { percent: 1, resetsAt: ms } } })

    expect(result.windows.map((item) => item.resetTime)).toEqual([ms])
  })

  it('reports unparseable resetsAt as 0 instead of failing the whole account', () => {
    const result = parseOpenCodeGoUsage({
      usage: { weekly: { percent: 1, resetsAt: 'not-a-date' } },
    })

    expect(result.windows.map((item) => item.resetTime)).toEqual([0])
  })

  it('clamps a string percentage out of range', () => {
    expect(
      parseOpenCodeGoUsage({ usage: { weekly: { percent: '999' } } }).windows.map(
        (item) => item.percent,
      ),
    ).toEqual([100])
    expect(
      parseOpenCodeGoUsage({ usage: { weekly: { percent: 'abc' } } }).windows.map(
        (item) => item.percent,
      ),
    ).toEqual([0])
  })

  it('rejects non-object payloads as InvalidResponse', () => {
    expect(() => parseOpenCodeGoUsage('boom')).toThrow(OpenCodeApiError)
    expect(() => parseOpenCodeGoUsage(null)).toThrow(/响应结构无法解析/)
  })
})
