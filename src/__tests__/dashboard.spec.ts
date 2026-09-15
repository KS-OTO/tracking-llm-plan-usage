import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import { useDashboardStore } from '../stores/dashboard'

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

/** 离线桩：定时器推进会真的触发 refresh()，这里只保证它不会打到网络。 */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
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

    // 下一次刷新应落在约一个刷新周期（60s）之后
    const delta = (store.nextRefreshAt?.getTime() ?? 0) - Date.now()
    expect(delta).toBeGreaterThan(59_000)
    expect(delta).toBeLessThanOrEqual(60_000)
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

    await vi.advanceTimersByTimeAsync(60_000)
    const second = store.nextRefreshAt?.getTime() ?? 0
    expect(second).toBeGreaterThan(first)
  })
})
