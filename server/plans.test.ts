import { describe, expect, it } from 'vite-plus/test'

import { PlanApiError, parseKimiPlan, parseMiniMaxPlan, resetTimeToMillis } from './plans.ts'

describe('parseKimiPlan', () => {
  it('parses the 5-hour limit and weekly usage windows', () => {
    const result = parseKimiPlan({
      limits: [{ detail: { limit: 100, remaining: 75, resetTime: 1786069888998 } }],
      usage: { limit: 1000, remaining: 400, resetTime: 1786069888998 },
    })

    expect(result.provider).toBe('Kimi For Coding')
    expect(result.windows).toEqual([
      { window: 'fiveHour', percent: 25, resetTime: 1786069888998 },
      { window: 'weekly', percent: 60, resetTime: 1786069888998 },
    ])
  })

  it('returns empty windows for an empty response', () => {
    expect(parseKimiPlan({}).windows).toEqual([])
  })

  it('caps utilization at 100', () => {
    const result = parseKimiPlan({ usage: { limit: 10, remaining: 0 } })

    expect(result.windows[0]?.percent).toBe(100)
  })
})

describe('parseMiniMaxPlan', () => {
  const generalRemains = {
    model_name: 'general',
    current_interval_remaining_percent: 70,
    end_time: 1786069888998,
    current_weekly_status: 1,
    current_weekly_remaining_percent: 40,
    weekly_end_time: 1786069888998,
  }

  it('parses 5-hour and weekly windows from the general model entry', () => {
    const result = parseMiniMaxPlan({ model_remains: [generalRemains] })

    expect(result.provider).toBe('MiniMax')
    expect(result.windows).toEqual([
      { window: 'fiveHour', percent: 30, resetTime: 1786069888998 },
      { window: 'weekly', percent: 60, resetTime: 1786069888998 },
    ])
  })

  it('skips the weekly window when weekly status is not active', () => {
    const result = parseMiniMaxPlan({
      model_remains: [{ ...generalRemains, current_weekly_status: 3 }],
    })

    expect(result.windows.map((window) => window.window)).toEqual(['fiveHour'])
  })

  it('throws when the base response reports an error', () => {
    expect(() =>
      parseMiniMaxPlan({ base_resp: { status_code: 1001, status_msg: 'cookie is missing' } }),
    ).toThrow(PlanApiError)
  })
})

describe('resetTimeToMillis', () => {
  it('keeps millisecond timestamps as-is', () => {
    expect(resetTimeToMillis(1_789_371_600_000)).toBe(1_789_371_600_000)
  })

  it('promotes second timestamps to milliseconds', () => {
    expect(resetTimeToMillis(1_789_371_600)).toBe(1_789_371_600_000)
  })

  it('parses ISO date strings', () => {
    expect(resetTimeToMillis('2026-09-20T09:00:00.000Z')).toBe(
      Date.parse('2026-09-20T09:00:00.000Z'),
    )
  })

  it('returns 0 for unusable values instead of a bogus epoch', () => {
    expect(resetTimeToMillis(undefined)).toBe(0)
    expect(resetTimeToMillis(null)).toBe(0)
    expect(resetTimeToMillis('')).toBe(0)
    expect(resetTimeToMillis('not-a-date')).toBe(0)
    expect(resetTimeToMillis(Number.NaN)).toBe(0)
  })
})
