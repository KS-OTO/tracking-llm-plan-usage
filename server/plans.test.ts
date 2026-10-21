import { describe, expect, it, vi } from 'vite-plus/test'

import {
  fetchMiniMaxPlan,
  normalizeMiniMaxSite,
  PlanApiError,
  parseKimiPlan,
  parseMiniMaxPlan,
  resetTimeToMillis,
} from './plans.ts'

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

  it('skips the weekly window when weekly status is unlimited', () => {
    const result = parseMiniMaxPlan({
      model_remains: [{ ...generalRemains, current_weekly_status: 3 }],
    })

    expect(result.windows.map((window) => window.window)).toEqual(['fiveHour'])
  })

  it('forces 100% when the upstream says a window is exhausted', () => {
    const result = parseMiniMaxPlan({
      model_remains: [
        {
          ...generalRemains,
          current_interval_status: 2,
          current_weekly_status: 2,
          current_weekly_remaining_percent: 40,
        },
      ],
    })

    expect(result.windows.map((window) => window.percent)).toEqual([100, 100])
  })

  it('rejects a bucket that is not part of the current plan', () => {
    expect(() =>
      parseMiniMaxPlan({
        model_remains: [
          {
            model_name: 'general',
            current_interval_remaining_percent: 100,
            current_weekly_remaining_percent: 100,
            current_interval_status: 3,
            current_weekly_status: 3,
            current_interval_total_count: 0,
            current_weekly_total_count: 0,
          },
        ],
      }),
    ).toThrow('不包含 general 额度')
  })

  it('throws when the response has no general bucket', () => {
    expect(() => parseMiniMaxPlan({ model_remains: [] })).toThrow('general')
  })

  it('throws when the base response reports an error', () => {
    expect(() =>
      parseMiniMaxPlan({ base_resp: { status_code: 1001, status_msg: 'cookie is missing' } }),
    ).toThrow(PlanApiError)
  })
})

describe('normalizeMiniMaxSite', () => {
  it('defaults to cn and accepts global aliases', () => {
    expect(normalizeMiniMaxSite(undefined)).toBe('cn')
    expect(normalizeMiniMaxSite('CN')).toBe('cn')
    expect(normalizeMiniMaxSite('global')).toBe('global')
    expect(normalizeMiniMaxSite('intl')).toBe('global')
  })

  it('rejects an unknown site instead of silently picking one', () => {
    expect(() => normalizeMiniMaxSite('eu')).toThrow('MINIMAX_SITE')
  })
})

describe('fetchMiniMaxPlan', () => {
  it('uses the new token_plan endpoint first and falls back on 404', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (input: unknown) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('/v1/token_plan/remains')) {
        return Promise.resolve(new Response('not found', { status: 404 }))
      }
      return Promise.resolve(
        Response.json({
          base_resp: { status_code: 0, status_msg: '' },
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 30,
              current_weekly_status: 1,
              current_weekly_remaining_percent: 60,
            },
          ],
        }),
      )
    })
    try {
      const plan = await fetchMiniMaxPlan('mm-key', 'global')

      expect(urls).toEqual([
        'https://api.minimax.io/v1/token_plan/remains',
        'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
      ])
      expect(plan.windows.map((window) => window.percent)).toEqual([70, 40])
    } finally {
      vi.unstubAllGlobals()
    }
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
