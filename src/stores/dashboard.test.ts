import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import { useDashboardStore } from './dashboard'

/**
 * 打开自动刷新。
 *
 * 必须**先关再开**：store 的定时器由 `watch(autoRefresh)` 启停，而初值就是 true，
 * 直接赋 true 属于同值写入、不会触发 watch。真实页面走的是 onMounted 里的首次启动，
 * 由 E2E 覆盖；这里验证的是「开关切换」这条路径。
 */
async function enableAutoRefresh(store: ReturnType<typeof useDashboardStore>): Promise<void> {
  store.autoRefresh = false
  await nextTick()
  store.autoRefresh = true
  await nextTick()
}

/** `/api/usage` 信封里的 provider 键（顺序无关，只需齐全）。 */
const USAGE_KEYS = [
  'deepseek',
  'volcPlan',
  'zhipu',
  'aliyun',
  'tokenPlan',
  'gitee',
  'baidu',
  'openrouter',
  'plans',
  'newapi',
] as const

/**
 * 造一个合法的 `/api/usage` 信封。
 *
 * 默认全部是 `NOT_CONFIGURED` 切片（与密封环境里「什么都没配」一致），
 * 需要断言某个平台时用 `overrides` 覆盖那一格。
 */
function usageEnvelope(
  overrides: Partial<Record<(typeof USAGE_KEYS)[number], unknown>> = {},
): string {
  const providers = Object.fromEntries(
    USAGE_KEYS.map((key) => [
      key,
      overrides[key] ?? { error: '未配置密钥', code: 'NOT_CONFIGURED' },
    ]),
  )
  return JSON.stringify({ providers, fetchedAt: Date.now() })
}

/**
 * 离线桩：定时器推进会真的触发 refresh()，这里只保证它不会打到网络。
 *
 * `statusBody` 用来模拟服务端随 `/api/status` 下发的站点配置（`site` 字段），
 * `/api/usage` 回一个齐全的（空）信封，火山推理回空账号数组。
 *
 * 入参固定声明为 `URL`：src/api.ts 的 get() 一律 `new URL(path, origin)` 后调用 fetch，
 * 因此这里可以直接用 `href` 判断端点（也避免 `String(input)` 的隐式字符串化）。
 */
/**
 * 桩返回的最小 Response 形状：`src/api.ts` 的 get() 只用 `ok` / `status` / `text()`，
 * 其余字段给个能编译的占位即可，不需要构造真的 Response。
 */
interface StubResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

function stubFetch(
  statusBody: unknown = {},
  usageBody: string = usageEnvelope(),
): ReturnType<typeof vi.fn> {
  const stub = vi.fn<(input: URL) => Promise<StubResponse>>((input) => {
    const href = input.href
    const body = href.includes('/api/status')
      ? JSON.stringify(statusBody)
      : href.includes('/api/usage')
        ? usageBody
        : JSON.stringify({ accounts: [] })
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({}),
    })
  })
  vi.stubGlobal('fetch', stub)
  return stub
}

/** 从 fetch 桩的调用记录里取出命中的端点路径。 */
function requestedPaths(stub: ReturnType<typeof vi.fn>): string[] {
  return stub.mock.calls.map((call) => new URL(String(call[0])).pathname)
}

describe('dashboard 自动刷新节奏', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('publishes the next refresh time while auto refresh is on', async () => {
    setActivePinia(createPinia())
    const store = useDashboardStore()
    await enableAutoRefresh(store)

    // 下一次刷新应落在约一个刷新周期（默认 180s）之后
    const delta = (store.nextRefreshAt?.getTime() ?? 0) - Date.now()
    expect(delta).toBeGreaterThan(179_000)
    expect(delta).toBeLessThanOrEqual(180_000)
  })

  it('clears the next refresh time when auto refresh is turned off', async () => {
    setActivePinia(createPinia())
    const store = useDashboardStore()
    await enableAutoRefresh(store)
    expect(store.nextRefreshAt).not.toBeNull()

    store.autoRefresh = false
    await nextTick()
    // 没有下一次刷新时必须是 null：UI 据此显示「已暂停」而非一个永不到来的时间
    expect(store.nextRefreshAt).toBeNull()
  })

  it('rolls the next refresh time forward after each tick', async () => {
    setActivePinia(createPinia())
    const store = useDashboardStore()
    await enableAutoRefresh(store)
    const first = store.nextRefreshAt?.getTime() ?? 0

    await vi.advanceTimersByTimeAsync(180_000)
    const second = store.nextRefreshAt?.getTime() ?? 0
    expect(second).toBeGreaterThan(first)
  })

  it('adopts the refresh interval published by the site config', async () => {
    setActivePinia(createPinia())
    stubFetch({
      site: {
        name: '内部用量面板',
        logoUrl: 'https://cdn.example.com/logo.svg',
        faviconUrl: null,
        refreshIntervalSeconds: 30,
      },
    })
    const store = useDashboardStore()
    await store.refresh()
    await enableAutoRefresh(store)

    // 站点把间隔配成 30s，定时器必须重排到这个新节奏（而不是等满一个 180s 兜底周期）
    expect(store.refreshIntervalSeconds).toBe(30)
    const delta = (store.nextRefreshAt?.getTime() ?? 0) - Date.now()
    expect(delta).toBeGreaterThan(29_000)
    expect(delta).toBeLessThanOrEqual(30_000)
    expect(store.site.name).toBe('内部用量面板')
    expect(store.site.logoUrl).toBe('https://cdn.example.com/logo.svg')
  })

  it('applies the site config without waiting for the slow provider queries', async () => {
    setActivePinia(createPinia())
    // 只有 /api/status 会返回，/api/usage 永远挂着：模拟某家上游接口长时间不响应
    const never = new Promise<never>(() => {
      // 故意永不落定
    })
    const statusBody = {
      site: {
        name: '内部用量面板',
        logoUrl: null,
        faviconUrl: null,
        refreshIntervalSeconds: 180,
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((input: URL) =>
        input.href.includes('/api/status')
          ? Promise.resolve({
              ok: true,
              status: 200,
              text: () => Promise.resolve(JSON.stringify(statusBody)),
              json: () => Promise.resolve({}),
            })
          : never,
      ),
    )
    const store = useDashboardStore()
    // 不能 await：其余 provider 永不落定，refresh() 也就永不返回
    void store.refresh()
    await vi.advanceTimersByTimeAsync(1)

    // 品牌文案必须在 provider 查询还挂着时就已落地 —— 否则自定义站点名要等好几秒才出现
    expect(store.site.name).toBe('内部用量面板')
    expect(store.loading).toBe(true)
  })

  it('falls back to the default interval when the site config is missing or illegal', async () => {
    setActivePinia(createPinia())
    // 非法的 0 不能让 setInterval 退化成忙循环，必须回落到默认间隔
    stubFetch({ site: { name: '内部用量面板', refreshIntervalSeconds: 0 } })
    const store = useDashboardStore()
    await store.refresh()
    await enableAutoRefresh(store)

    expect(store.refreshIntervalSeconds).toBe(180)
    expect(store.site.logoUrl).toBeNull()
  })
})

/**
 * 合并端点的落地（issue #23）。
 *
 * 合并的动机是边缘计费（唤醒次数），但**容错粒度必须保持不变** ——
 * 这几条测试锁住的正是「减少了请求数，没有减少容错」。
 */
describe('/api/usage 信封的落地', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('每次刷新只发 status + usage 两个请求；首屏额外带一次火山推理', async () => {
    setActivePinia(createPinia())
    const stub = stubFetch()
    const store = useDashboardStore()

    await store.refresh()
    expect(requestedPaths(stub).toSorted()).toStrictEqual([
      '/api/status',
      '/api/usage',
      '/api/volc/inference-usage',
    ])

    stub.mockClear()
    await store.refresh()
    // 自动刷新不再拉火山推理（它的明细表按天聚合，且改过滤条件时另有单独重拉）
    expect(requestedPaths(stub).toSorted()).toStrictEqual(['/api/status', '/api/usage'])
  })

  it('手动刷新带 refresh=1，让服务端绕过 TTL 缓存', async () => {
    setActivePinia(createPinia())
    const stub = stubFetch()
    const store = useDashboardStore()

    await store.refresh(true)
    const usageUrl = stub.mock.calls
      .map((call) => new URL(String(call[0])))
      .find((url) => url.pathname === '/api/usage')
    expect(usageUrl?.searchParams.get('refresh')).toBe('1')

    stub.mockClear()
    await store.refresh()
    const plainUrl = stub.mock.calls
      .map((call) => new URL(String(call[0])))
      .find((url) => url.pathname === '/api/usage')
    expect(plainUrl?.searchParams.get('refresh')).toBeNull()
  })

  it('一家的业务错误只影响那一家的切片，其余照常落地', async () => {
    setActivePinia(createPinia())
    stubFetch(
      {},
      usageEnvelope({
        deepseek: {
          data: { accounts: [{ keyHint: 'sk-****a1b2', isAvailable: true, balances: [] }] },
        },
        zhipu: { error: '智谱上游内部错误', code: 'INTERNAL_ERROR' },
      }),
    )
    const store = useDashboardStore()
    await store.refresh()

    expect(store.deepseek.data?.accounts).toHaveLength(1)
    expect(store.deepseek.error).toBeNull()
    expect(store.zhipu.error).toBe('智谱上游内部错误')
    expect(store.zhipu.notConfigured).toBe(false)
    // 未被覆盖的那几家是 NOT_CONFIGURED 的中性空态，不是报错
    expect(store.baidu.notConfigured).toBe(true)
    expect(store.baidu.error).toBeNull()
  })

  it('NOT_CONFIGURED 渲染成中性空态：error 为 null、notConfigured 为 true', async () => {
    setActivePinia(createPinia())
    stubFetch(
      {},
      usageEnvelope({
        gitee: { error: '未配置 GITEE_AI_API_KEY 环境变量', code: 'NOT_CONFIGURED' },
      }),
    )
    const store = useDashboardStore()
    await store.refresh()

    expect(store.gitee.notConfigured).toBe(true)
    expect(store.gitee.error).toBeNull()
  })

  it('信封整体失败时 9 家一起标注，但保留上一次成功的数据', async () => {
    setActivePinia(createPinia())
    stubFetch(
      {},
      usageEnvelope({
        baidu: { data: { accounts: [{ keyHint: 'sk-****c3d4', packages: [], tpmQuotas: [] }] } },
      }),
    )
    const store = useDashboardStore()
    await store.refresh()
    expect(store.baidu.data?.accounts).toHaveLength(1)

    // 下一轮后端 500：数据保留，错误落到所有切片上
    vi.stubGlobal(
      'fetch',
      vi.fn((input: URL) =>
        String(input).includes('/api/status')
          ? Promise.resolve({
              ok: true,
              status: 200,
              text: () => Promise.resolve('{}'),
              json: () => Promise.resolve({}),
            })
          : Promise.resolve({
              ok: false,
              status: 500,
              text: () =>
                Promise.resolve('{"error":{"code":"INTERNAL_ERROR","message":"后台炸了"}}'),
              json: () => Promise.resolve({}),
            }),
      ),
    )
    await store.refresh()

    expect(store.baidu.error).toBe('后台炸了')
    expect(store.baidu.data?.accounts).toHaveLength(1)
    expect(store.deepseek.error).toBe('后台炸了')
    expect(store.deepseek.notConfigured).toBe(false)
  })

  it('后端返回的信封缺 providers 时给出可诊断的提示，而不是静默清空', async () => {
    setActivePinia(createPinia())
    // 老服务端没有 /api/usage，或返回了别的形状
    stubFetch({}, '{}')
    const store = useDashboardStore()
    await store.refresh()

    expect(store.deepseek.error).toContain('providers')
    expect(store.deepseek.data).toBeNull()
  })
})
