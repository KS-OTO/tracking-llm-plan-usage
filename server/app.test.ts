import { describe, expect, it } from 'vite-plus/test'

import {
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_SITE_NAME,
  readSiteConfig,
  REFRESH_INTERVAL_RANGE,
  runAccounts,
} from './app.ts'
import type { EnvGetter } from './multi.ts'

/** 只提供显式给出的变量；其余一律 undefined（模拟平台面板里没配的样子）。 */
function envOf(vars: Record<string, string>): EnvGetter {
  return (key) => vars[key]
}

/**
 * 站点自定义配置的读取与钳制。
 *
 * 这块的价值全在「配错/没配时不能把页面搞坏」：站点名缺失要退回默认名，
 * Logo/favicon 留空要当成未配置（而不是渲染成破图），刷新间隔非法要回落 ——
 * 因为这些值最终会喂给 `document.title`、`<img src>` 和 `setInterval`，
 * 其中 `setInterval(fn, 0)` 会退化成忙循环打爆上游。
 */
describe('readSiteConfig', () => {
  it('falls back to the defaults when nothing is configured', () => {
    expect(readSiteConfig(envOf({}))).toStrictEqual({
      name: DEFAULT_SITE_NAME,
      logoUrl: null,
      logoUrlDark: null,
      faviconUrl: null,
      refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
    })
  })

  it('reads the site name and trims surrounding whitespace', () => {
    expect(readSiteConfig(envOf({ SITE_NAME: '  内部用量面板  ' })).name).toBe('内部用量面板')
  })

  it('treats an explicitly blank site name as "logo only" instead of the default', () => {
    // 显式留空 = 用户要求品牌位只显示 Logo（Logo 本身已是完整字标时很常见）。
    // 绝不能悄悄换成默认名——那是「没配过」的语义。
    expect(readSiteConfig(envOf({ SITE_NAME: '   ' })).name).toBe('')
    expect(readSiteConfig(envOf({ SITE_NAME: '' })).name).toBe('')
    expect(readSiteConfig(envOf({ SITE_NAME: '  ' })).name).toBe('')
  })

  it('keeps the default name when SITE_NAME is absent (not the same as blank)', () => {
    // 变量缺失 = 从没配过 → 开箱即用的默认名
    expect(readSiteConfig(envOf({})).name).toBe(DEFAULT_SITE_NAME)
    expect(readSiteConfig(envOf({ SITE_LOGO_URL: 'https://cdn.example.com/logo.png' })).name).toBe(
      DEFAULT_SITE_NAME,
    )
  })

  it('reads logo and favicon urls, treating blank as not configured', () => {
    const config = readSiteConfig(
      envOf({
        SITE_LOGO_URL: 'https://cdn.example.com/logo.svg',
        SITE_FAVICON_URL: '',
      }),
    )
    expect(config.logoUrl).toBe('https://cdn.example.com/logo.svg')
    expect(config.faviconUrl).toBeNull()
  })

  it('reads a separate dark-mode logo without mirroring the light one into it', () => {
    const both = readSiteConfig(
      envOf({
        SITE_LOGO_URL: 'https://cdn.example.com/logo-light.svg',
        SITE_LOGO_URL_DARK: 'https://cdn.example.com/logo-dark.svg',
      }),
    )
    expect(both.logoUrl).toBe('https://cdn.example.com/logo-light.svg')
    expect(both.logoUrlDark).toBe('https://cdn.example.com/logo-dark.svg')

    // 不镜像：只配了亮色时 logoUrlDark 必须是 null，前端才能区分
    // 「用户配了同一张图」和「用户没配暗色图」。回落由前端的 pickLogoUrl 负责。
    const lightOnly = readSiteConfig(envOf({ SITE_LOGO_URL: 'https://cdn.example.com/logo.svg' }))
    expect(lightOnly.logoUrlDark).toBeNull()

    // 留空与缺失同义：都当作「没配暗色图」
    expect(readSiteConfig(envOf({ SITE_LOGO_URL_DARK: '   ' })).logoUrlDark).toBeNull()
  })

  it('uses the published refresh interval when it is a plain number', () => {
    expect(readSiteConfig(envOf({ REFRESH_INTERVAL_SECONDS: '30' })).refreshIntervalSeconds).toBe(
      30,
    )
  })

  it('rounds a fractional refresh interval to whole seconds', () => {
    expect(readSiteConfig(envOf({ REFRESH_INTERVAL_SECONDS: '45.6' })).refreshIntervalSeconds).toBe(
      46,
    )
  })

  it('clamps an out-of-range refresh interval to the nearest bound', () => {
    // 过小会打爆上游配额，过大则「自动刷新」形同虚设，因此钳到边界而不是回默认值
    expect(readSiteConfig(envOf({ REFRESH_INTERVAL_SECONDS: '1' })).refreshIntervalSeconds).toBe(
      REFRESH_INTERVAL_RANGE.min,
    )
    expect(
      readSiteConfig(envOf({ REFRESH_INTERVAL_SECONDS: '99999' })).refreshIntervalSeconds,
    ).toBe(REFRESH_INTERVAL_RANGE.max)
  })

  it('falls back to the default interval for a non-numeric or non-positive value', () => {
    for (const raw of ['abc', '', '   ', '0', '-5']) {
      expect(readSiteConfig(envOf({ REFRESH_INTERVAL_SECONDS: raw })).refreshIntervalSeconds).toBe(
        DEFAULT_REFRESH_INTERVAL_SECONDS,
      )
    }
  })
})

/**
 * 多账号容错契约。
 *
 * `runAccounts` 是前端 `AccountEnvelope` 形态（成功项展开数据、失败项只带 error）与
 * 「单个账号失败不影响其余账号」这两条契约的唯一真相源。它曾经有一个隐性依赖：
 * 用下标回查 `entries` 与 `allSettled` 结果配对，而那条路径从未被测试锁定过。
 * 这里把它钉死，避免以后改实现时无声破坏前端容错渲染。
 */
describe('runAccounts', () => {
  it('expands each account result and tags it with its own key hint', async () => {
    const results = await runAccounts([
      { keyHint: 'sk-a', run: async () => ({ balance: 1 }) },
      { keyHint: 'sk-b', run: async () => ({ balance: 2 }) },
    ])
    expect(results).toStrictEqual([
      { balance: 1, keyHint: 'sk-a' },
      { balance: 2, keyHint: 'sk-b' },
    ])
  })

  it('omits the label key entirely when no alias is configured', async () => {
    // 断言的是「键不存在」而不是「值为 undefined」：写入 label: undefined 会覆盖
    // 供应商响应里原有的 label（如 OpenRouter 的密钥名称），造成信息静默丢失
    const results = await runAccounts([{ keyHint: 'sk-a', run: async () => ({ label: '原始名' }) }])
    expect(results[0]).toStrictEqual({ label: '原始名', keyHint: 'sk-a' })
  })

  it('keeps the configured alias as the display label', async () => {
    const results = await runAccounts([{ keyHint: 'sk-a', label: '主力号', run: async () => ({}) }])
    expect(results[0]).toStrictEqual({ keyHint: 'sk-a', label: '主力号' })
  })

  it('isolates a failing account and preserves the order of the rest', async () => {
    const results = await runAccounts([
      { keyHint: 'sk-a', run: async () => ({ n: 1 }) },
      {
        keyHint: 'sk-b',
        run: async () => {
          throw new Error('boom')
        },
      },
      { keyHint: 'sk-c', run: async () => ({ n: 3 }) },
    ])
    expect(results).toStrictEqual([
      { n: 1, keyHint: 'sk-a' },
      // 失败项只带 keyHint/label/error，不带任何数据字段
      { keyHint: 'sk-b', label: undefined, error: 'boom' },
      { n: 3, keyHint: 'sk-c' },
    ])
  })

  it('maps a known error code to the Chinese hint', async () => {
    const failure = Object.assign(new Error('bad key'), { code: 'InvalidApiKey' })
    const results = await runAccounts([
      {
        keyHint: 'sk-a',
        run: async () => {
          throw failure
        },
      },
    ])
    expect(results[0]).toStrictEqual({
      keyHint: 'sk-a',
      label: undefined,
      error: 'API Key 无效：bad key',
    })
  })

  it('stringifies a non-Error rejection reason', async () => {
    // 上游抛的不是 Error 时不能崩：走 String() 兜底，错误文案仍要落到 error 字段
    const results = await runAccounts([
      { keyHint: 'sk-a', run: () => Promise.reject('flat string') },
    ])
    expect(results[0]).toStrictEqual({
      keyHint: 'sk-a',
      label: undefined,
      error: 'flat string',
    })
  })

  it('runs every account even when an earlier one fails', async () => {
    const calls: string[] = []
    await runAccounts([
      {
        keyHint: 'sk-a',
        run: async () => {
          calls.push('a')
          throw new Error('a failed')
        },
      },
      {
        keyHint: 'sk-b',
        run: async () => {
          calls.push('b')
          return {}
        },
      },
    ])
    expect(calls).toStrictEqual(['a', 'b'])
  })
})
