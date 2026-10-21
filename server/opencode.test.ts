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
      // 0% 时上游的 resetsAt 是占位值，解析层丢弃（见 CC-Switch 同一口径）
      { window: 'fiveHour', percent: 0, resetTime: 0 },
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

  it('throws when no window can be parsed instead of rendering an empty card', () => {
    expect(() => parseOpenCodeGoUsage({})).toThrow('额度窗口')
    expect(() => parseOpenCodeGoUsage({ usage: null })).toThrow('额度窗口')
  })

  it('clamps out-of-range percentages and skips windows without a percent', () => {
    const result = parseOpenCodeGoUsage({
      usage: {
        rolling: { percent: 150, resetsAt: ISO_ROLLING },
        weekly: { percent: -8, resetsAt: ISO_WEEKLY },
        monthly: { resetsAt: ISO_MONTHLY },
      },
    })

    // percent 缺失 → 跳过该窗口（CC-Switch 同一口径），不再伪造 0%
    expect(result.windows.map((item) => item.percent)).toEqual([100, 0])
  })

  it('drops the upstream placeholder reset when percent is zero', () => {
    const result = parseOpenCodeGoUsage({
      usage: {
        rolling: { percent: 0, resetsAt: ISO_ROLLING },
        weekly: { percent: 0, resetsAt: ISO_WEEKLY },
      },
    })

    // 0% 时 resetsAt 是「now + 窗口时长」，展示倒计时会误导
    expect(result.windows.map((item) => item.resetTime)).toEqual([0, 0])
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
    expect(() => parseOpenCodeGoUsage({ usage: { weekly: { percent: 'abc' } } })).toThrow(
      '额度窗口',
    )
  })

  it('rejects non-object payloads as InvalidResponse', () => {
    expect(() => parseOpenCodeGoUsage('boom')).toThrow(OpenCodeApiError)
    expect(() => parseOpenCodeGoUsage(null)).toThrow(/响应结构无法解析/)
  })
})

// status 字段来源：官方文档与两个独立实现（cljdoc vis-provider-opencode-go、
// axonhub PR #2204）均确认窗口形如 { status, percent, resetsAt }，
// status 取 `ok` / `rate-limited`。丢弃它会丢失「超额被限流」这一信息。
describe('parseOpenCodeGoUsage window status', () => {
  it('carries a non-ok status through so the UI can flag it', () => {
    const result = parseOpenCodeGoUsage({
      usage: {
        rolling: { status: 'ok', percent: 0, resetsAt: ISO_ROLLING },
        weekly: { status: 'rate-limited', percent: 100, resetsAt: ISO_WEEKLY },
      },
    })

    expect(result.windows.map((item) => item.status)).toEqual([undefined, 'rate-limited'])
  })

  it('treats ok, blank and non-string statuses as normal (key omitted)', () => {
    const result = parseOpenCodeGoUsage({
      usage: {
        rolling: { status: 'ok', percent: 1 },
        weekly: { status: '  OK  ', percent: 1 },
        monthly: { status: '', percent: 1 },
      },
    })

    // 归一化后不写入 status 键，既有响应结构保持稳定
    expect(result.windows).toEqual([
      { window: 'fiveHour', percent: 1, resetTime: 0 },
      { window: 'weekly', percent: 1, resetTime: 0 },
      { window: 'monthly', percent: 1, resetTime: 0 },
    ])
  })

  it('keeps an unrecognised status verbatim instead of dropping it', () => {
    const result = parseOpenCodeGoUsage({ usage: { monthly: { status: 'exhausted', percent: 1 } } })

    expect(result.windows.map((item) => item.status)).toEqual(['exhausted'])
  })

  it('ignores a non-string status', () => {
    const result = parseOpenCodeGoUsage({
      usage: { rolling: { status: 500, percent: 3 }, weekly: { status: null, percent: 4 } },
    })

    expect(result.windows.map((item) => item.status)).toEqual([undefined, undefined])
  })
})
