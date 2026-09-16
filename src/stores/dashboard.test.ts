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

/**
 * 离线桩：定时器推进会真的触发 refresh()，这里只保证它不会打到网络。
 *
 * `statusBody` 用来模拟服务端随 `/api/status` 下发的站点配置（`site` 字段），
 * 其余接口一律回空对象。
 *
 * 入参固定声明为 `URL`：src/api.ts 的 get() 一律 `new URL(path, origin)` 后调用 fetch，
 * 因此这里可以直接用 `href` 判断端点（也避免 `String(input)` 的隐式字符串化）。
 */
function stubFetch(statusBody: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(input.href.includes('/api/status') ? JSON.stringify(statusBody) : '{}'),
        json: () => Promise.resolve({}),
      }),
    ),
  )
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
    // 只有 /api/status 会返回，其余 11 路永远挂着：模拟某家上游接口长时间不响应
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
