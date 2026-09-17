import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  DEFAULT_CUSTOM_CURRENCY_SYMBOL,
  DEFAULT_SITE_CURRENCY,
  NewApiError,
  QUOTA_PER_UNIT,
  UNLIMITED_AMOUNT,
  fetchNewApi,
  normalizeBaseUrl,
  parseBillingSubscription,
  parseBillingUsage,
  parseLogStat,
  parseQuotaDates,
  parseSelf,
  parseSiteStatus,
  parseSubscriptionSelf,
  quotaToDisplay,
  shouldFallbackToBilling,
  siteUrl,
  toQuotaUnit,
} from './newapi'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const activeSubscription = {
  success: true,
  data: {
    billing_preference: 'subscription_first',
    subscriptions: [
      {
        subscription: {
          id: 24,
          plan_id: 2,
          status: 'active',
          amount_total: 750_000_000,
          amount_used: 23_114_638,
          start_time: 1_787_308_949,
          end_time: 1_850_467_349,
          last_reset_time: 1_789_315_200,
          next_reset_time: 1_789_920_000,
          allow_wallet_overflow: false,
        },
      },
    ],
  },
}

describe('normalizeBaseUrl', () => {
  it('补全协议与尾斜杠', () => {
    expect(normalizeBaseUrl('ai.example.com')).toBe('https://ai.example.com/')
    expect(normalizeBaseUrl('http://ai.example.com')).toBe('http://ai.example.com/')
    expect(normalizeBaseUrl('https://ai.example.com/')).toBe('https://ai.example.com/')
  })

  it('保留子路径（部分部署挂在网关前缀下）', () => {
    expect(normalizeBaseUrl('https://example.com/gateway')).toBe('https://example.com/gateway/')
  })

  it('空值返回空串', () => {
    expect(normalizeBaseUrl('   ')).toBe('')
  })
})

describe('siteUrl', () => {
  it('按站点地址拼出控制台与可用模型页', () => {
    expect(siteUrl('https://ai.example.com/', 'dashboard')).toBe('https://ai.example.com/dashboard')
    expect(siteUrl('ai.example.com', 'pricing')).toBe('https://ai.example.com/pricing')
  })

  it('空站点地址返回空串', () => {
    expect(siteUrl('', 'dashboard')).toBe('')
  })
})

describe('parseSelf', () => {
  it('解析钱包额度与身份信息', () => {
    expect(
      parseSelf({
        success: true,
        data: {
          username: 'xulz',
          display_name: '许凌志',
          group: 'default',
          quota: 500_000,
          used_quota: 29_076_516_545,
          request_count: 414_265,
        },
      }),
    ).toEqual({
      username: 'xulz',
      displayName: '许凌志',
      group: 'default',
      quota: 500_000,
      usedQuota: 29_076_516_545,
      requestCount: 414_265,
    })
  })

  it('缺失字段取中性值而不是抛错', () => {
    expect(parseSelf({ success: true, data: {} })).toMatchObject({ quota: 0, usedQuota: 0 })
  })

  it('业务失败（success=false）视为错误', () => {
    expect(() => parseSelf({ success: false, message: '未登录' })).toThrow(NewApiError)
  })
})

describe('parseSubscriptionSelf', () => {
  it('解析生效订阅的周期窗口（秒级时间戳转毫秒）', () => {
    const result = parseSubscriptionSelf(activeSubscription)
    expect(result.preference).toBe('subscription_first')
    expect(result.active).toMatchObject({
      status: 'active',
      planId: 2,
      total: 1500,
      used: 23_114_638 / QUOTA_PER_UNIT,
      lastResetAt: 1_789_315_200_000,
      nextResetAt: 1_789_920_000_000,
      endAt: 1_850_467_349_000,
      allowWalletOverflow: false,
    })
    expect(result.active?.percent).toBeCloseTo(3.08, 1)
  })

  it('已过期 / 已取消的订阅不算生效（否则会拿失效窗口当当前额度）', () => {
    const expired = {
      data: {
        subscriptions: [
          {
            subscription: {
              ...activeSubscription.data.subscriptions[0]?.subscription,
              status: 'expired',
            },
          },
        ],
      },
    }
    expect(parseSubscriptionSelf(expired).active).toBeNull()
  })

  it('没有订阅功能时安全降级', () => {
    expect(parseSubscriptionSelf({ data: { subscriptions: [] } }).active).toBeNull()
    expect(parseSubscriptionSelf({}).active).toBeNull()
    expect(parseSubscriptionSelf({ data: 'unexpected' }).active).toBeNull()
  })
})

describe('parseLogStat', () => {
  it('把 quota 折算成额度单位', () => {
    expect(parseLogStat({ data: { quota: 3_398_169_395, rpm: 3, tpm: 0 } })).toEqual({
      quota: 3_398_169_395 / QUOTA_PER_UNIT,
      rpm: 3,
      tpm: 0,
    })
  })

  it('结构不符返回 null（不视为故障）', () => {
    expect(parseLogStat({})).toBeNull()
  })
})

describe('parseQuotaDates', () => {
  it('按模型聚合并按额度降序', () => {
    const result = parseQuotaDates({
      data: [
        { model_name: 'gpt-a', quota: 1000, count: 2, token_used: 30 },
        { model_name: 'gpt-b', quota: 5000, count: 1, token_used: 10 },
        { model_name: 'gpt-a', quota: 2000, count: 3, token_used: 40 },
      ],
    })
    expect(result.map((row) => row.model)).toEqual(['gpt-b', 'gpt-a'])
    expect(result[1]).toEqual({
      model: 'gpt-a',
      quota: 3000 / QUOTA_PER_UNIT,
      requests: 5,
      tokens: 70,
    })
  })

  it('模型名为空归入「未知模型」', () => {
    expect(
      parseQuotaDates({ data: [{ model_name: '', quota: 1, count: 1, token_used: 1 }] })[0]?.model,
    ).toBe('未知模型')
  })
})

describe('parseBillingSubscription / parseBillingUsage', () => {
  it('哨兵值判定为无限额度', () => {
    expect(parseBillingSubscription({ hard_limit_usd: UNLIMITED_AMOUNT }).unlimited).toBe(true)
    expect(parseBillingSubscription({ hard_limit_usd: 12.5 }).unlimited).toBe(false)
  })

  it('access_until 换算为毫秒', () => {
    expect(
      parseBillingSubscription({ hard_limit_usd: 10, access_until: 1_700_000_000 }).expiredAt,
    ).toBe(1_700_000_000_000)
  })

  it('total_usage 是「已用 × 100」', () => {
    expect(parseBillingUsage({ total_usage: 2_262_562.9024 })).toBeCloseTo(22_625.629_024, 6)
  })
})

describe('shouldFallbackToBilling', () => {
  it('管理接口 401/403 才回落', () => {
    expect(shouldFallbackToBilling(new NewApiError('x', 'y', 401))).toBe(true)
    expect(shouldFallbackToBilling(new NewApiError('x', 'y', 403))).toBe(true)
  })

  it('其余错误不回落（否则会掩盖真实故障）', () => {
    expect(shouldFallbackToBilling(new NewApiError('x', 'y', 500))).toBe(false)
    expect(shouldFallbackToBilling(new Error('boom'))).toBe(false)
  })

  it('账号被停用的 401 不回落：令牌是被认出来的，落下去只会换个更含糊的结论', () => {
    expect(
      shouldFallbackToBilling(new NewApiError('AUTH_USER_DISABLED', 'User has been banned', 401)),
    ).toBe(false)
  })
})

describe('fetchNewApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 按路径分发的 fetch 桩：未预期的路径直接抛错，避免测试「静默通过」。 */
  function stubFetch(handlers: Record<string, () => Response>, calls: string[]) {
    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = String(input)
      calls.push(url)
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (url.includes(fragment)) {
          return Promise.resolve(handler())
        }
      }
      return Promise.resolve(jsonResponse({ message: 'unexpected path' }, 404))
    })
  }

  it('订阅模式：周期窗口取订阅周期，用量走 flow 接口', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/user/self': () =>
          jsonResponse({
            success: true,
            data: { username: 'xulz', group: 'default', quota: 0, used_quota: 0, request_count: 1 },
          }),
        '/api/subscription/self': () => jsonResponse(activeSubscription),
        '/api/log/self/stat': () =>
          jsonResponse({ data: { quota: QUOTA_PER_UNIT, rpm: 1, tpm: 2 } }),
        '/api/data/flow/self': () =>
          jsonResponse({
            data: [{ model_name: 'gpt-a', quota: QUOTA_PER_UNIT, count: 3, token_used: 9 }],
          }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'ai.example.com', token: 'sk-test' })

    expect(result.mode).toBe('subscription')
    expect(result.subscription?.total).toBe(1500)
    expect(result.wallet).toBeNull()
    expect(result.models).toEqual([{ model: 'gpt-a', quota: 1, requests: 3, tokens: 9 }])
    // 窗口起点必须是「上次重置时间」，不能是「近 30 天」
    expect(result.windowStart).toBe(1_789_315_200_000)
    expect(calls.some((url) => url.includes('/api/data/flow/self'))).toBe(true)
    expect(calls.some((url) => url.includes('/api/data/self'))).toBe(false)
  })

  it('订阅 + 钱包并存时标记为 both，并各自给出读数', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/user/self': () =>
          jsonResponse({
            success: true,
            data: {
              username: 'xulz',
              group: 'default',
              quota: QUOTA_PER_UNIT,
              used_quota: QUOTA_PER_UNIT * 2,
              request_count: 7,
            },
          }),
        '/api/subscription/self': () => jsonResponse(activeSubscription),
        '/api/log/self/stat': () => jsonResponse({ data: { quota: 0, rpm: 0, tpm: 0 } }),
        '/api/data/flow/self': () => jsonResponse({ data: [] }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'sk-test' })

    expect(result.mode).toBe('both')
    expect(result.billingPreference).toBe('subscription_first')
    expect(result.wallet).toMatchObject({ remain: 1, used: 2, total: 3, requestCount: 7 })
    expect(result.subscription?.total).toBe(1500)
    expect(result.consoleUrl).toBe('https://ai.example.com/dashboard')
    expect(result.modelsUrl).toBe('https://ai.example.com/pricing')
  })

  it('纯钱包模式：无订阅时窗口回落到近 30 天，用量走 data/self', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/user/self': () =>
          jsonResponse({
            success: true,
            data: {
              username: 'xulz',
              group: 'default',
              quota: 500_000,
              used_quota: 0,
              request_count: 2,
            },
          }),
        '/api/subscription/self': () => jsonResponse({ data: { subscriptions: [] } }),
        '/api/log/self/stat': () => jsonResponse({ data: { quota: 0, rpm: 0, tpm: 0 } }),
        '/api/data/self': () =>
          jsonResponse({
            data: [{ model_name: 'gpt-b', quota: QUOTA_PER_UNIT * 2, count: 1, token_used: 5 }],
          }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'sk-test' })

    expect(result.mode).toBe('wallet')
    expect(result.subscription).toBeNull()
    expect(result.wallet?.remain).toBe(1)
    expect(result.models).toEqual([{ model: 'gpt-b', quota: 2, requests: 1, tokens: 5 }])
    expect(calls.some((url) => url.includes('/api/data/self'))).toBe(true)
    expect(calls.some((url) => url.includes('/api/data/flow/self'))).toBe(false)
  })

  it('订阅接口不可用时不拖垮整张卡（降级为钱包模式）', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/user/self': () =>
          jsonResponse({
            success: true,
            data: { username: 'xulz', group: 'default', quota: 500_000, used_quota: 0 },
          }),
        '/api/subscription/self': () => jsonResponse({ message: 'not found' }, 404),
        '/api/log/self/stat': () => jsonResponse({ data: { quota: 0, rpm: 0, tpm: 0 } }),
        '/api/data/self': () => jsonResponse({ data: [] }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'sk-test' })
    expect(result.mode).toBe('wallet')
    expect(result.wallet?.remain).toBe(1)
  })

  it('管理接口 401 时回落到账单接口', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/user/self': () =>
          jsonResponse(
            { code: 'AUTH_UNAUTHORIZED', message: 'invalid access token', success: false },
            401,
          ),
        'billing/subscription': () => jsonResponse({ hard_limit_usd: 50, access_until: 0 }),
        'billing/usage': () => jsonResponse({ total_usage: 1234.5 }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'sk-test' })

    expect(result.source).toBe('billing')
    expect(result.currency).toBeNull()
    expect(result.mode).toBe('wallet')
    expect(result.wallet).toMatchObject({ total: 50, used: 12.345 })
    expect(result.wallet?.remain).toBeCloseTo(37.655, 6)
    expect(calls.some((url) => url.includes('/v1/dashboard/billing/'))).toBe(true)
  })

  it('账号被停用时直说原因，而不是透出账单接口那句 Invalid token', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/user/self': () =>
          jsonResponse(
            { code: 'AUTH_USER_DISABLED', message: 'User has been banned', success: false },
            401,
          ),
        // 若误回落，这里会返回一句没有信息量的 Invalid token 把真因盖掉
        'billing/subscription': () =>
          jsonResponse({ error: { message: 'Invalid token', type: 'new_api_error' } }, 401),
        'billing/usage': () => jsonResponse({ total_usage: 0 }),
      },
      calls,
    )

    await expect(
      fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'sk-test' }),
    ).rejects.toThrow(/账号被禁用/)

    expect(calls.some((url) => url.includes('billing'))).toBe(false)
  })

  it('网络异常直接抛出，不静默降级', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))
    await expect(
      fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'sk-test' }),
    ).rejects.toThrow(NewApiError)
  })

  it('按站点 /api/status 的展示类型折算读数与单位（CNY 站点）', async () => {
    const calls: string[] = []
    stubFetch(
      {
        '/api/status': () =>
          jsonResponse({
            data: { quota_display_type: 'CNY', quota_per_unit: 500_000, usd_exchange_rate: 7.3 },
          }),
        '/api/user/self': () =>
          jsonResponse({
            success: true,
            data: { quota: 500_000, used_quota: 0, request_count: 1 },
          }),
        '/api/subscription/self': () => jsonResponse({ data: { subscriptions: [] } }),
        '/api/log/self/stat': () => jsonResponse({ data: { quota: 500_000, rpm: 0, tpm: 0 } }),
        '/api/data/self': () =>
          jsonResponse({ data: [{ model_name: 'gpt-c', quota: 1_000_000, count: 1 }] }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'token-test' })

    expect(result.currency).toEqual({ type: 'CNY', unit: '¥' })
    // 500000 quota = 1 USD = 7.3 CNY
    expect(result.wallet?.remain).toBeCloseTo(7.3, 10)
    expect(result.stats?.quota).toBeCloseTo(7.3, 10)
    expect(result.models[0]?.quota).toBeCloseTo(14.6, 10)
    expect(result.subscription).toBeNull()
  })

  it('/api/status 不可用（老站点）时按 USD 兜底，读数照常给出', async () => {
    const calls: string[] = []
    stubFetch(
      {
        // 桩里未登记 /api/status → 落到 404 分支
        '/api/user/self': () =>
          jsonResponse({
            success: true,
            data: { quota: QUOTA_PER_UNIT, used_quota: 0, request_count: 1 },
          }),
        '/api/subscription/self': () => jsonResponse({ data: { subscriptions: [] } }),
        '/api/log/self/stat': () => jsonResponse({ data: { quota: 0, rpm: 0, tpm: 0 } }),
        '/api/data/self': () => jsonResponse({ data: [] }),
      },
      calls,
    )

    const result = await fetchNewApi({ baseUrl: 'https://ai.example.com/', token: 'token-test' })

    expect(result.currency).toEqual({ type: 'USD', unit: '$' })
    expect(result.wallet?.remain).toBe(1)
  })
})

describe('parseSiteStatus', () => {
  it('USD：符号 $，汇率 1', () => {
    expect(
      parseSiteStatus({
        data: { quota_display_type: 'USD', quota_per_unit: 500_000, usd_exchange_rate: 7.3 },
      }),
    ).toEqual({ type: 'USD', unit: '$', rate: 1, quotaPerUnit: 500_000 })
  })

  it('CNY：符号 ¥，按 usd_exchange_rate 折算', () => {
    expect(
      parseSiteStatus({ data: { quota_display_type: 'CNY', usd_exchange_rate: 7.3 } }),
    ).toMatchObject({ type: 'CNY', unit: '¥', rate: 7.3 })
  })

  it('CUSTOM：用站点自定义符号与汇率', () => {
    expect(
      parseSiteStatus({
        data: {
          quota_display_type: 'CUSTOM',
          custom_currency_symbol: '€',
          custom_currency_exchange_rate: 0.92,
        },
      }),
    ).toMatchObject({ type: 'CUSTOM', unit: '€', rate: 0.92 })
  })

  it('CUSTOM 缺符号时回落官方占位符，汇率非正按 1 处理', () => {
    const parsed = parseSiteStatus({
      data: { quota_display_type: 'CUSTOM', custom_currency_exchange_rate: 0 },
    })
    expect(parsed.unit).toBe(DEFAULT_CUSTOM_CURRENCY_SYMBOL)
    expect(parsed.rate).toBe(1)
  })

  it('TOKENS：不折算，单位是「点」', () => {
    expect(parseSiteStatus({ data: { quota_display_type: 'TOKENS' } })).toMatchObject({
      type: 'TOKENS',
      unit: '点',
      rate: 1,
    })
  })

  it('小写 / 未知 / 缺失的值一律按官方默认 USD 兜底（老站点少字段不能拖垮卡片）', () => {
    for (const body of [
      { data: { quota_display_type: 'usd' } },
      { data: { quota_display_type: 'JPY' } },
      { data: {} },
      {},
      null,
      'not json',
    ]) {
      expect(parseSiteStatus(body)).toEqual(DEFAULT_SITE_CURRENCY)
    }
  })

  it('兼容裸对象与 {success,data} 两种包法', () => {
    expect(parseSiteStatus({ quota_display_type: 'CNY', usd_exchange_rate: 7 })).toMatchObject({
      type: 'CNY',
      rate: 7,
    })
  })

  it('quota_per_unit 沿用站点设置（不是写死 500000）', () => {
    expect(parseSiteStatus({ data: { quota_per_unit: 1_000_000 } }).quotaPerUnit).toBe(1_000_000)
  })
})

describe('quotaToDisplay', () => {
  it('USD：quota / quota_per_unit', () => {
    expect(quotaToDisplay(500_000, DEFAULT_SITE_CURRENCY)).toBe(1)
  })

  it('CNY：再乘 usd_exchange_rate', () => {
    const cny = parseSiteStatus({ data: { quota_display_type: 'CNY', usd_exchange_rate: 7.3 } })
    expect(quotaToDisplay(500_000, cny)).toBeCloseTo(7.3, 10)
  })

  it('TOKENS：直接返回 quota 原值（官方 logger.LogQuota 口径）', () => {
    const tokens = parseSiteStatus({ data: { quota_display_type: 'TOKENS' } })
    expect(quotaToDisplay(500_000, tokens)).toBe(500_000)
  })

  it('站点 quota_per_unit 非正时回落默认值', () => {
    const broken = { ...DEFAULT_SITE_CURRENCY, quotaPerUnit: 0 }
    expect(quotaToDisplay(500_000, broken)).toBe(1)
  })

  it('toQuotaUnit 只把类型与单位交给前端', () => {
    expect(toQuotaUnit(parseSiteStatus({ data: { quota_display_type: 'CNY' } }))).toEqual({
      type: 'CNY',
      unit: '¥',
    })
  })
})
