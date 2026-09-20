import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { z } from 'zod'

import {
  createAppHandler,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_SITE_NAME,
  logSafe,
  readSiteConfig,
  REFRESH_INTERVAL_RANGE,
  runAccounts,
  volcDateRange,
} from './app.ts'
import { clearQueryCache } from './cache.ts'
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

const StatusBody = z.object({ incomplete: z.array(z.string()) })

/**
 * 半配置检测（`/api/status` 的 `incomplete`）。
 *
 * 成对凭据遇到「只配了一半」时会**整对丢弃**，对应平台的卡片于是整个消失 ——
 * 页面上既没有报错也没有空状态，用户能观察到的只有「少了一张卡」，无从自查。
 * New API 曾经漏在这张表之外，本机就因为变量改过名（`NEWAPI_API_KEY` → `NEWAPI_TOKEN`）
 * 而无声丢卡。这里把它钉住，让「缺哪个变量」由总览页的提示条说出来。
 */
describe('INCOMPLETE_VARS', () => {
  async function incompleteOf(vars: Record<string, string>): Promise<string[]> {
    const handler = createAppHandler(envOf(vars))
    const res = await handler(new Request('https://app.example.com/api/status'))
    if (!res) {
      throw new Error('/api/status 必须返回响应（只有未匹配的路径才会是 null）')
    }
    return StatusBody.parse(JSON.parse(await res.text())).incomplete
  }

  it('New API 只配了站点地址、没配令牌时，点名缺的是 NEWAPI_TOKEN', async () => {
    expect(await incompleteOf({ NEWAPI_BASE_URL: 'https://ai.example.com/' })).toStrictEqual([
      'NEWAPI_TOKEN',
    ])
  })

  it('成对配齐后不再报缺', async () => {
    expect(
      await incompleteOf({
        NEWAPI_BASE_URL: 'https://ai.example.com/',
        NEWAPI_TOKEN: 'system-access-token',
      }),
    ).toStrictEqual([])
  })
})

/**
 * `/api/usage` 的**独立容错**（issue #23 的验收 3）。
 *
 * 两件事必须同时成立，测试分两层钉住：
 * 1. **平台之间**互不牵连 —— 一家上游挂了，信封里其余 9 家照常带数据；
 * 2. **平台内部**的子查询也互不牵连 —— 智谱的 Coding Plan 额度接口对**未订阅**的账号
 *    直接返回 `{"success":false,"code":500,"msg":"内部服务器错误"}`，而同一个 Key
 *    查余额、查资源包都是好的；不切片的话整卡只剩一句不知所云的 "Internal service error"。
 *
 * 注：切片是判别联合（`{data} | {error}`），而 zod 的 `z.unknown()` / `z.custom()` 会把键
 * 判成可选、union 于是塌成 `{}`，TS 侧拿不到字段。改用 record：既保留「对象」这个运行时
 * 校验，又能让索引签名把字段放出来。
 */
const UsageBody = z.object({ providers: z.record(z.string(), z.record(z.string(), z.unknown())) })
const AccountsPayload = z.object({ accounts: z.array(z.record(z.string(), z.unknown())) })

/** 打一次 `/api/usage`（可带查询串），返回原始响应。 */
async function usageRequest(vars: Record<string, string>, search = ''): Promise<Response> {
  const handler = createAppHandler(envOf(vars))
  const res = await handler(new Request(`https://app.example.com/api/usage${search}`))
  if (!res) {
    throw new Error('/api/usage 必须返回响应')
  }
  return res
}

/** 打一次 `/api/usage`，取出整个 provider 信封。 */
async function usageProvidersOf(
  vars: Record<string, string>,
  search = '',
): Promise<Record<string, Record<string, unknown>>> {
  return UsageBody.parse(await (await usageRequest(vars, search)).json()).providers
}

/** 打一次 `/api/usage`，取出某个 provider 的切片。 */
async function usageSliceOf(
  vars: Record<string, string>,
  provider: string,
): Promise<Record<string, unknown>> {
  const slice = (await usageProvidersOf(vars))[provider]
  if (!slice) {
    throw new Error(`信封里缺少 provider: ${provider}`)
  }
  return slice
}

/** 从切片里取账号数组（断言它确实是成功切片）。 */
function accountsOf(slice: Record<string, unknown>): Record<string, unknown>[] {
  const parsed = AccountsPayload.safeParse(slice.data)
  if (!parsed.success) {
    throw new Error(`期望成功切片，实际是: ${JSON.stringify(slice).slice(0, 200)}`)
  }
  return parsed.data.accounts
}

/** 三个智谱子接口各自返回预设响应，按 URL 区分（额度 500，余额与资源包正常）。 */
function stubZhipuFetch(): void {
  vi.stubGlobal('fetch', (input: unknown) => {
    const url = String(input)
    const payload = url.includes('/api/monitor/usage/quota/limit')
      ? { success: false, code: 500, msg: '内部服务器错误' }
      : url.includes('tokenAccounts/list/my')
        ? { code: 200, msg: '操作成功', total: 0, rows: [] }
        : {
            code: 200,
            msg: '操作成功',
            data: {
              balance: 56.7,
              availableBalance: 56.7,
              rechargeAmount: 0,
              giveAmount: 56.7,
              creditStatus: 'NOT_OPEN',
            },
          }
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  })
}

describe('/api/usage：平台之间与子查询之间的独立容错', () => {
  /**
   * 缓存是**模块级**的（这是边缘计费下唯一有意义的粒度），因此它会跨用例存活。
   * 不在这里清掉的话，某个用例的桩响应会悄悄喂给下一个用例 ——
   * 症状是「测试单独跑通过、一起跑失败」，而且看起来像是容错逻辑坏了。
   */
  beforeEach(() => {
    clearQueryCache()
  })

  it('智谱额度接口 500 时，余额与资源包仍然返回（不再整卡失败）', async () => {
    stubZhipuFetch()
    try {
      const slice = await usageSliceOf({ ZHIPU_API_KEY: 'test.zhipu-key' }, 'zhipu')
      const account = accountsOf(slice)[0]
      expect(account?.codingPlan).toHaveProperty('error')
      expect(account?.balance).toHaveProperty('data')
      expect(account?.packages).toHaveProperty('data')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('额度失败的原因要给出可自查的中文提示，而不是上游英文原文', async () => {
    stubZhipuFetch()
    try {
      const slice = await usageSliceOf({ ZHIPU_API_KEY: 'test.zhipu-key' }, 'zhipu')
      const codingPlan = accountsOf(slice)[0]?.codingPlan
      if (!codingPlan || typeof codingPlan !== 'object' || !('error' in codingPlan)) {
        throw new Error('额度查询应当以 error 切片的形式返回')
      }
      const reason = String(codingPlan.error)
      // 带上「未订阅」这条自查线索，否则用户只能看到一句「内部服务器错误」
      expect(reason).toContain('Coding Plan')
      expect(reason).toContain('未订阅')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('未配置的平台是 NOT_CONFIGURED 切片，且不影响已配置的平台', async () => {
    stubZhipuFetch()
    try {
      const providers = await usageProvidersOf({ ZHIPU_API_KEY: 'test.zhipu-key' })

      // 只配了智谱：其余 9 家全是「未配置」，而不是让整个请求 503
      expect(providers.deepseek).toStrictEqual({
        error: '未配置 DEEPSEEK_API_KEY 环境变量',
        code: 'NOT_CONFIGURED',
      })
      expect(providers.zhipu).toHaveProperty('data')
      // 信封里 10 个 provider 一个都不能少（少一格前端就会静默丢一张卡）
      expect(Object.keys(providers).toSorted()).toStrictEqual([
        'aliyun',
        'baidu',
        'deepseek',
        'gitee',
        'newapi',
        'openrouter',
        'plans',
        'tokenPlan',
        'volcPlan',
        'zhipu',
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('一家上游挂了不影响另一家：智谱成功、DeepSeek 失败', async () => {
    vi.stubGlobal('fetch', (input: unknown) => {
      const url = String(input)
      if (url.includes('api.deepseek.com')) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'boom' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      const payload = url.includes('/api/monitor/usage/quota/limit')
        ? { success: false, code: 500, msg: '内部服务器错误' }
        : url.includes('tokenAccounts/list/my')
          ? { code: 200, msg: '操作成功', total: 0, rows: [] }
          : {
              code: 200,
              msg: '操作成功',
              data: { balance: 56.7, availableBalance: 56.7, rechargeAmount: 0, giveAmount: 56.7 },
            }
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    try {
      const vars = { ZHIPU_API_KEY: 'test.zhipu-key', DEEPSEEK_API_KEY: 'sk-deepseek-key' }
      const deepseek = await usageSliceOf(vars, 'deepseek')
      const zhipu = await usageSliceOf(vars, 'zhipu')

      // 容错是**两级**的，这里要同时锁住粒度：
      // ① provider 级切片仍是成功（`runAccounts` 把账号级失败收敛进 accounts 数组），
      //    所以一家的账号失败不会把这一格变成错误切片；
      // ② 失败落在**账号**这一层 —— 前端照常出卡并显示「查询失败」横幅，卡片不会消失。
      const deepseekAccount = accountsOf(deepseek)[0]
      expect(typeof deepseekAccount?.error).toBe('string')
      expect(deepseekAccount?.error).not.toBe('')
      // 失败账号只带 keyHint/error，成功才有的数据字段一个都不该出现
      expect(deepseekAccount).not.toHaveProperty('isAvailable')
      // 隔壁智谱的三个子查询各答各的：这里只关心它没被 DeepSeek 连坐
      expect(accountsOf(zhipu)[0]?.balance).toHaveProperty('data')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /**
   * TTL 缓存是 issue #23 里最直接的省钱杠杆：托管在按**节点生存时间**计费的边缘云上，
   * 一次刷新只打一次上游墙钟，而不是每次刷新都重新等 10 家平台。
   */
  it('缓存命中时上游调用数为 0，手动刷新则绕过缓存', async () => {
    let calls = 0
    vi.stubGlobal('fetch', (input: unknown) => {
      calls += 1
      const payload = String(input).includes('api.deepseek.com')
        ? {
            is_available: true,
            balance_infos: [
              {
                currency: 'CNY',
                total_balance: 12.34,
                granted_balance: 0,
                topped_up_balance: 12.34,
              },
            ],
          }
        : {}
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    try {
      const vars = { DEEPSEEK_API_KEY: 'sk-deepseek-key' }
      await usageProvidersOf(vars)
      const afterFirst = calls
      expect(afterFirst).toBe(1)

      // 第二次：命中缓存 → 一次上游都不打
      const cached = await usageProvidersOf(vars)
      expect(calls).toBe(afterFirst)
      expect(accountsOf(cached.deepseek ?? {})[0]?.isAvailable).toBe(true)

      // `?refresh=1`（手动点刷新）必须拿实时数据，因此绕过缓存读取
      await usageProvidersOf(vars, '?refresh=1')
      expect(calls).toBe(afterFirst + 1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /**
   * 未配置（provider 级抛出）**不进缓存**。
   *
   * 这条比「失败不缓存」更贴近用户：配好 Key 之后**立刻**就该看到数据，
   * 而不是先吃 60 秒上一次留下的「未配置」空态。
   */
  it('未配置不进缓存：补上 Key 后立刻打上游，不用等 TTL 过期', async () => {
    let calls = 0
    vi.stubGlobal('fetch', () => {
      calls += 1
      return Promise.resolve(
        new Response(JSON.stringify({ is_available: true, balance_infos: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    try {
      // 一个 Key 都没配：`/api/usage` 照常 200，10 家全是 NOT_CONFIGURED，且**零上游调用**
      const before = await usageSliceOf({}, 'deepseek')
      expect(before).toHaveProperty('error')
      expect(before.code).toBe('NOT_CONFIGURED')
      expect(calls).toBe(0)

      const after = await usageSliceOf({ DEEPSEEK_API_KEY: 'sk-deepseek-key' }, 'deepseek')
      expect(after).toHaveProperty('data')
      expect(calls).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/** 区间天数（含首尾）。用 UTC 解析，避免本地时区把算出来的天数挪一天。 */
function spanDays(range: { start: string; end: string }): number {
  const ms = Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

/**
 * 火山两条查询接口（`GetUsageDetails` / `GetInferenceUsage`）都是 31 天封顶，
 * 超了直接 400 `InvalidParameter.TimeRange`。`dateRange` 本身允许到 90 天
 * （别的平台能接受），所以火山路径必须自己收口 —— 否则 `?days=90` 会让整张卡变红。
 */
describe('volcDateRange', () => {
  it('没给天数时用套餐明细的默认 7 天', () => {
    expect(spanDays(volcDateRange(null))).toBe(7)
  })

  it('把超过 31 天的请求夹到 31 天（上游在这个点位上会 400）', () => {
    expect(['32', '60', '90'].map((days) => spanDays(volcDateRange(days)))).toStrictEqual([
      31, 31, 31,
    ])
  })

  it('31 天以内原样保留', () => {
    expect(['14', '31'].map((days) => spanDays(volcDateRange(days)))).toStrictEqual([14, 31])
  })

  it('非法输入走默认值，越界输入不产生零天或负区间', () => {
    expect(['abc', '0', '-5'].map((days) => spanDays(volcDateRange(days)))).toStrictEqual([7, 7, 1])
  })
})

describe('logSafe', () => {
  it('原样保留普通文本（含中文与空格）', () => {
    expect(logSafe('/api/status 正常')).toBe('/api/status 正常')
  })

  it('把换行与回车转义掉（否则请求方可以在日志里伪造出新的一行）', () => {
    expect(logSafe('/api/x\n[app] GET /api/y failed:')).toBe(
      '/api/x\\u000a[app] GET /api/y failed:',
    )
    expect(logSafe('/api/x\r\n')).toBe('/api/x\\u000d\\u000a')
  })

  it('转义制表符与 DEL', () => {
    expect(logSafe('a\tb')).toBe('a\\u0009b')
    expect(logSafe('a\u007fb')).toBe('a\\u007fb')
  })
})
