import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { cachedQuery, clearQueryCache, queryCacheSize } from './cache.ts'

afterEach(() => {
  clearQueryCache()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** 计数用的 loader：每次调用返回递增值，`calls` 即上游调用次数。 */
function countingLoader(): { calls: number; load: () => Promise<number> } {
  const state = { calls: 0 }
  return {
    get calls() {
      return state.calls
    },
    load: () => {
      state.calls += 1
      return Promise.resolve(state.calls)
    },
  }
}

describe('cachedQuery', () => {
  it('TTL 内命中缓存，不再打上游', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T00:00:00Z'))
    const loader = countingLoader()

    expect(await cachedQuery('k', { ttlSeconds: 60 }, loader.load)).toBe(1)
    vi.setSystemTime(new Date('2026-09-17T00:00:30Z'))
    expect(await cachedQuery('k', { ttlSeconds: 60 }, loader.load)).toBe(1)
    expect(loader.calls).toBe(1)
  })

  it('TTL 过期后重新打上游', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T00:00:00Z'))
    const loader = countingLoader()

    await cachedQuery('k', { ttlSeconds: 60 }, loader.load)
    vi.setSystemTime(new Date('2026-09-17T00:01:01Z'))
    expect(await cachedQuery('k', { ttlSeconds: 60 }, loader.load)).toBe(2)
    expect(loader.calls).toBe(2)
  })

  it('ttlSeconds 为 0 时等于不缓存', async () => {
    const loader = countingLoader()

    await cachedQuery('k', { ttlSeconds: 0 }, loader.load)
    await cachedQuery('k', { ttlSeconds: 0 }, loader.load)
    expect(loader.calls).toBe(2)
    expect(queryCacheSize()).toBe(0)
  })

  it('并发调用单飞：同一时刻 N 次请求只打一次上游', async () => {
    const loader = countingLoader()

    const results = await Promise.all([
      cachedQuery('k', { ttlSeconds: 60 }, loader.load),
      cachedQuery('k', { ttlSeconds: 60 }, loader.load),
      cachedQuery('k', { ttlSeconds: 60 }, loader.load),
    ])
    expect(results).toStrictEqual([1, 1, 1])
    expect(loader.calls).toBe(1)
  })

  it('bypass 跳过缓存读取，但仍然复用在途请求', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T00:00:00Z'))
    const loader = countingLoader()

    await cachedQuery('k', { ttlSeconds: 600 }, loader.load)

    // 缓存里有值，但手动刷新必须绕过它
    expect(await cachedQuery('k', { ttlSeconds: 600, bypass: true }, loader.load)).toBe(2)
    expect(loader.calls).toBe(2)

    // 绕过时若已有在途请求，则复用它（不为「同一秒内的两次点击」重复付费）
    const slow = cachedQuery('k', { ttlSeconds: 600, bypass: true }, loader.load)
    expect(await cachedQuery('k', { ttlSeconds: 600, bypass: true }, loader.load)).toBe(3)
    expect(await slow).toBe(3)
    expect(loader.calls).toBe(3)
  })

  it('bypass 写回缓存，随后的普通请求又能命中', async () => {
    const loader = countingLoader()

    await cachedQuery('k', { ttlSeconds: 600, bypass: true }, loader.load)
    await cachedQuery('k', { ttlSeconds: 600 }, loader.load)
    expect(loader.calls).toBe(1)
  })

  it('失败不写缓存：下一轮会重试而不是继续吃同样的错', async () => {
    let attempt = 0
    const load = (): Promise<string> => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok')
    }

    await expect(cachedQuery('k', { ttlSeconds: 600 }, load)).rejects.toThrow('boom')
    expect(await cachedQuery('k', { ttlSeconds: 600 }, load)).toBe('ok')
    expect(attempt).toBe(2)
  })

  it('失败后清掉在途记录：并发的第二个请求不会被同一个失败拖死', async () => {
    let attempt = 0
    const load = (): Promise<number> => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('first')) : Promise.resolve(2)
    }

    const results = await Promise.allSettled([
      cachedQuery('k', { ttlSeconds: 60 }, load),
      cachedQuery('k', { ttlSeconds: 60 }, load),
    ])
    // 第二个请求在第一个已 settle 之后才发起（共用同一 promise）
    expect(results[0]?.status).toBe('rejected')
    expect(await cachedQuery('k', { ttlSeconds: 60 }, load)).toBe(2)
  })

  it('不同 key 互不干扰', async () => {
    const a = countingLoader()
    const b = countingLoader()

    await cachedQuery('a', { ttlSeconds: 60 }, a.load)
    await cachedQuery('b', { ttlSeconds: 60 }, b.load)
    await cachedQuery('a', { ttlSeconds: 60 }, a.load)
    expect(a.calls).toBe(1)
    expect(b.calls).toBe(1)
    expect(queryCacheSize()).toBe(2)
  })

  it('clearQueryCache 清空条目与在途记录', async () => {
    const loader = countingLoader()

    await cachedQuery('k', { ttlSeconds: 600 }, loader.load)
    expect(queryCacheSize()).toBe(1)
    clearQueryCache()
    expect(queryCacheSize()).toBe(0)
    await cachedQuery('k', { ttlSeconds: 600 }, loader.load)
    expect(loader.calls).toBe(2)
  })
})
