import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formatReset,
  isCompactAccounts,
  maskKey,
  metricGridClass,
  pickLogoUrl,
  platformInitial,
  progressStatus,
  ratioOf,
  shouldSpanFullRow,
  sortPlatformSections,
} from './utils'

describe('maskKey', () => {
  it('keeps only the first and last 4 characters', () => {
    expect(maskKey('sk-0123456789abcdef')).toBe('sk-0****cdef')
  })

  it('masks short keys entirely', () => {
    expect(maskKey('abcdefgh')).toBe('****')
    expect(maskKey('abc')).toBe('****')
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

describe('metricGridClass', () => {
  /**
   * 列数由**读数个数**声明（#19）。这两个变体名是「语义 → class」的唯一映射，
   * 组件里不许再手写 `grid-metrics--2`，否则加变体时要 grep 十个组件。
   */
  it('成对读数固定两列，不再受容器宽度影响', () => {
    expect(metricGridClass(2)).toBe('grid-metrics grid-metrics--2')
  })

  it('三个读数用 --3（桌面 3 / 平板 2 / 手机 1）', () => {
    expect(metricGridClass(3)).toBe('grid-metrics grid-metrics--3')
  })

  it('1 个与 4 个以上落回通用 auto-fit', () => {
    expect(metricGridClass(1)).toBe('grid-metrics')
    expect(metricGridClass(5)).toBe('grid-metrics')
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

describe('pickLogoUrl', () => {
  const both = {
    logoUrl: 'https://cdn.example.com/light.png',
    logoUrlDark: 'https://cdn.example.com/dark.png',
  }
  const lightOnly = { logoUrl: both.logoUrl, logoUrlDark: null }
  const none = { logoUrl: null, logoUrlDark: null }

  it('picks the image that matches the theme', () => {
    expect(pickLogoUrl(both, false, new Set())).toBe(both.logoUrl)
    expect(pickLogoUrl(both, true, new Set())).toBe(both.logoUrlDark)
  })

  it('falls back to the light logo when no dark logo is configured', () => {
    // 服务端不做镜像（logoUrlDark 缺失就是 null），回落由这里负责
    expect(pickLogoUrl(lightOnly, true, new Set())).toBe(both.logoUrl)
  })

  it('falls back to the other one when the preferred image failed to load', () => {
    expect(pickLogoUrl(both, true, new Set([both.logoUrlDark]))).toBe(both.logoUrl)
    expect(pickLogoUrl(both, false, new Set([both.logoUrl]))).toBe(both.logoUrlDark)
  })

  it('returns null only when neither candidate is usable', () => {
    expect(pickLogoUrl(none, false, new Set())).toBeNull()
    expect(pickLogoUrl(none, true, new Set())).toBeNull()
    expect(pickLogoUrl(both, true, new Set([both.logoUrl, both.logoUrlDark]))).toBeNull()
  })
})

describe('platformInitial', () => {
  it('takes the pinyin initial for Chinese platform names', () => {
    // 中文按拼音首字母（zh/ch/sh 归入 z/c/s），与拉丁名混在同一个 A→Z 序列里
    expect(platformInitial('阿里云百炼 资源包')).toBe('A')
    expect(platformInitial('百度千帆')).toBe('B')
    expect(platformInitial('火山方舟 Agent Plan')).toBe('H')
    expect(platformInitial('模力方舟（Gitee AI）')).toBe('M')
    expect(platformInitial('智谱 GLM Coding Plan')).toBe('Z')
    expect(platformInitial('知了')).toBe('Z')
  })

  it('takes the latin initial for ascii names (case-insensitive)', () => {
    expect(platformInitial('DeepSeek 余额')).toBe('D')
    expect(platformInitial('openrouter')).toBe('O')
    expect(platformInitial('  OpenCode Go')).toBe('O')
  })

  it('falls back to # when there is no leading letter', () => {
    expect(platformInitial('')).toBe('#')
    expect(platformInitial('   ')).toBe('#')
    expect(platformInitial('2026 平台')).toBe('#')
  })
})

/** 构造排序输入项（就是平台卡描述符里参与排序的那两个字段）。 */
function section(name: string, count: number) {
  return { name, count }
}

describe('sortPlatformSections', () => {
  it('puts the platform with more keys first (3 keys > 2 keys > 1 key)', () => {
    const sorted = sortPlatformSections([
      section('火山方舟 Agent Plan', 1),
      section('OpenCode Go', 3),
      section('智谱 GLM Coding Plan', 2),
    ])
    expect(sorted.map((item) => item.name)).toEqual([
      'OpenCode Go',
      '智谱 GLM Coding Plan',
      '火山方舟 Agent Plan',
    ])
  })

  it('breaks ties by platform initial, mixing pinyin with latin', () => {
    const sorted = sortPlatformSections([
      section('智谱 GLM 余额', 1),
      section('OpenRouter', 1),
      section('阿里资源包', 1),
      section('DeepSeek 余额', 1),
      section('百度千帆', 1),
      section('火山方舟', 1),
    ])
    expect(sorted.map((item) => item.name)).toEqual([
      '阿里资源包',
      '百度千帆',
      'DeepSeek 余额',
      '火山方舟',
      'OpenRouter',
      '智谱 GLM 余额',
    ])
  })

  it('keeps a full page ordering stable regardless of input order', () => {
    const sections = [
      section('模力方舟（Gitee AI）', 2),
      section('OpenCode Go', 2),
      section('阿里云百炼 资源包', 1),
      section('阿里云百炼 Token Plan', 1),
      section('百度千帆', 1),
      section('智谱 GLM 余额', 1),
      section('DeepSeek 余额', 1),
      section('火山方舟 Agent Plan', 1),
      section('OpenRouter', 1),
    ]
    const expected = [
      '模力方舟（Gitee AI）',
      'OpenCode Go',
      '阿里云百炼 资源包',
      '阿里云百炼 Token Plan',
      '百度千帆',
      'DeepSeek 余额',
      '火山方舟 Agent Plan',
      'OpenRouter',
      '智谱 GLM 余额',
    ]
    expect(sortPlatformSections(sections).map((item) => item.name)).toEqual(expected)
    expect(sortPlatformSections(sections.toReversed()).map((item) => item.name)).toEqual(expected)
  })

  it('does not mutate the input array', () => {
    const sections = [section('火山方舟', 1), section('OpenCode Go', 2)]
    sortPlatformSections(sections)
    expect(sections.map((item) => item.name)).toEqual(['火山方舟', 'OpenCode Go'])
  })
})

describe('账号卡网格的列策略（#18）', () => {
  const SRC_DIR = dirname(fileURLToPath(import.meta.url))

  it('2 个 Key 起独占整行', () => {
    expect(shouldSpanFullRow(1)).toBe(false)
    expect(shouldSpanFullRow(2)).toBe(true)
  })

  it('5 个 Key 起切紧凑行式（停止加列）', () => {
    expect(isCompactAccounts(4)).toBe(false)
    expect(isCompactAccounts(5)).toBe(true)
  })

  /**
   * 守卫：谓词、模板、样式表三处必须同时存在。
   *
   * 这三个谓词的分工是「App.vue 按区块的 Key 数决定列策略」，组件侧一律不判断。
   * 漏了任何一环都不会让别的用例失败 —— 只会在「5 个 Key 的账号」上肉眼可见，
   * 而那正是没人会天天搭的测试数据。所以在这里把接线固定住。
   */
  it('谓词真的接到了模板与样式表上', () => {
    const app = readFileSync(resolve(SRC_DIR, 'App.vue'), 'utf8')
    const css = readFileSync(resolve(SRC_DIR, 'assets/layout.css'), 'utf8')

    expect(app).toContain("'grid-span-all': shouldSpanFullRow(section.count)")
    expect(app).toContain("'section-compact': isCompactAccounts(section.count)")
    // 只有谓词、没有规则 = 静默失效
    expect(css).toContain('.grid-span-all {')
    expect(css).toContain('.section-compact .grid-cards {')
    expect(css).toContain('.section-compact .window-block {')
  })
})
