import { describe, expect, it } from 'vite-plus/test'

import { sortByTime, timeValue } from './detail'
import type { InferenceUsageResponse, VolcPlanData } from './types'
import { buildInferenceView, toVolcPlanDetail } from './components/VolcPlanDetail'
describe('sortByTime', () => {
  it('desc：最新的在最上（数字时间戳）', () => {
    const rows = [
      { id: 'old', at: 1_700_000_000_000 },
      { id: 'new', at: 1_800_000_000_000 },
      { id: 'mid', at: 1_750_000_000_000 },
    ]
    expect(sortByTime(rows, (row) => row.at).map((row) => row.id)).toEqual(['new', 'mid', 'old'])
  })

  it('asc：先到期的在前（可解析时间文本）', () => {
    const rows = [
      { id: 'later', at: '2026-12-31' },
      { id: 'sooner', at: '2026-11-30T23:59:59' },
      { id: 'middle', at: '2026-12-01T00:00:00Z' },
    ]
    expect(sortByTime(rows, (row) => row.at, { direction: 'asc' }).map((row) => row.id)).toEqual([
      'sooner',
      'middle',
      'later',
    ])
  })

  it('无时间（0 / 空串 / 非法文本）无论方向都沉底', () => {
    const rows = [
      { id: 'forever', at: 0 },
      { id: 'dated', at: 1_700_000_000_000 },
      { id: 'blank', at: '' },
      { id: 'garbage', at: 'not-a-date' },
    ]
    expect(sortByTime(rows, (row) => row.at).map((row) => row.id)).toEqual([
      'dated',
      'forever',
      'blank',
      'garbage',
    ])
    expect(sortByTime(rows, (row) => row.at, { direction: 'asc' }).map((row) => row.id)).toEqual([
      'dated',
      'forever',
      'blank',
      'garbage',
    ])
  })

  it('tieBreak 决定同一时刻的行序，缺省时保持传入顺序', () => {
    const rows = [
      { id: 'b', at: 1_700_000_000_000, usage: 1 },
      { id: 'a', at: 1_700_000_000_000, usage: 9 },
    ]
    expect(sortByTime(rows, (row) => row.at).map((row) => row.id)).toEqual(['b', 'a'])
    expect(
      sortByTime(rows, (row) => row.at, {
        tieBreak: (left, right) => right.usage - left.usage,
      }).map((row) => row.id),
    ).toEqual(['a', 'b'])
  })
})

describe('timeValue', () => {
  it('毫秒数与时间文本都换算成可比较的毫秒', () => {
    expect(timeValue(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(timeValue('2026-11-13')).toBe(Date.UTC(2026, 10, 13))
    // 空格分隔的写法（资源包 / 代金券接口常见）必须能解析，否则整表退回上游乱序
    expect(timeValue('2026-11-13 08:30:00')).toBe(Date.parse('2026-11-13T08:30:00'))
    expect(timeValue('')).toBeNull()
    expect(timeValue(0)).toBeNull()
    expect(timeValue('2026-13-45')).toBeNull()
  })
})

/** 火山 Agent Plan 响应里模型调用明细的原始（乱序）形态。 */
function volcAccount(details: VolcPlanData['details']) {
  return {
    keyHint: 'AKLT****2MmE',
    planType: 'Medium',
    personalPlan: null,
    windows: [],
    details,
    detailsStart: '2026-11-10',
    detailsEnd: '2026-11-16',
    codingPlan: { status: 'Reclaimed', updateTimestamp: 0, windows: [] },
  } satisfies VolcPlanData & { keyHint: string }
}

describe('toVolcPlanDetail 模型调用明细', () => {
  it('按时间倒序，同一天按用量降序，不沿用上游乱序', () => {
    const account = volcAccount([
      {
        time: Date.UTC(2026, 10, 11),
        objectName: 'doubao-seed-2-1-pro-260915',
        usage: 1_210_000,
        unit: 'Tokens',
        billingType: 'WithinPlan',
      },
      {
        time: Date.UTC(2026, 10, 13),
        objectName: 'doubao-seed-2-1-pro-260915',
        usage: 380_000,
        unit: 'Tokens',
        billingType: 'WithinPlan',
      },
      {
        time: Date.UTC(2026, 10, 11),
        objectName: 'deepseek-v4-1-flash-economy-261017',
        usage: 96_890_000,
        unit: 'Tokens',
        billingType: 'WithinPlan',
      },
      {
        time: Date.UTC(2026, 10, 13),
        objectName: 'deepseek-v4-1-flash-261017',
        usage: 20_230_000,
        unit: 'Tokens',
        billingType: 'WithinPlan',
      },
    ])
    const detail = toVolcPlanDetail(account, buildInferenceView(null, null, account.keyHint))
    expect(detail.tables[0]?.rows.map((row) => row.objectName)).toEqual([
      'deepseek-v4-1-flash-261017',
      'doubao-seed-2-1-pro-260915',
      'deepseek-v4-1-flash-economy-261017',
      'doubao-seed-2-1-pro-260915',
    ])
  })
})

describe('buildInferenceView 推理用量', () => {
  it('按日期倒序，不沿用上游顺序', () => {
    const response: InferenceUsageResponse = {
      accounts: [
        {
          keyHint: 'AKLT****2MmE',
          start: '2026-11-10',
          end: '2026-11-16',
          rows: [
            {
              day: '2026-11-11',
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              imageCount: 0,
              requests: 70,
            },
            {
              day: '2026-11-13',
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              imageCount: 0,
              requests: 5,
            },
            {
              day: '2026-11-12',
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              imageCount: 0,
              requests: 2,
            },
          ],
        },
      ],
    }
    const view = buildInferenceView(response, null, 'AKLT****2MmE')
    expect(view.rows.map((row) => row.day)).toEqual(['2026-11-13', '2026-11-12', '2026-11-11'])
  })
})
