import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  describeFetchFailure,
  describeTransportError,
  fetchWithRetry,
  TransportError,
} from './transport.ts'

function transportFailure(code: string): TypeError {
  return Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error(''), { code }),
  })
}

function okResponse(): Response {
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
}

/** 递归排空微任务队列，避免在循环里 await（oxlint no-await-in-loop）。 */
async function flushMicrotasks(times: number): Promise<void> {
  if (times <= 0) {
    return
  }
  await Promise.resolve()
  return flushMicrotasks(times - 1)
}

/** 放行当前这一波挂起的 fetch，让下一波进场；波次上限防止死循环。 */
async function drainWaves(started: (() => void)[], rounds = 10): Promise<void> {
  if (started.length === 0 || rounds <= 0) {
    return
  }
  for (const release of started.splice(0)) {
    release()
  }
  await flushMicrotasks(5)
  return drainWaves(started, rounds - 1)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('describeFetchFailure', () => {
  it('keeps the undici cause chain instead of the bare TypeError', () => {
    expect(describeFetchFailure(transportFailure('ETIMEDOUT'))).toBe('fetch failed <- (ETIMEDOUT)')
  })

  it('falls back to String() for non-error throws', () => {
    expect(describeFetchFailure('boom')).toBe('boom')
  })
})

describe('describeTransportError', () => {
  it('reports attempts for exhausted retries and the chain for anything else', () => {
    expect(
      describeTransportError(new TransportError(3, 'fetch failed <- (ECONNRESET)'), 'X 请求失败'),
    ).toBe('X 请求失败（已尝试 3 次）: fetch failed <- (ECONNRESET)')
    expect(describeTransportError(new Error('bad json'), 'X 请求失败')).toBe('X 请求失败: bad json')
  })
})

describe('fetchWithRetry', () => {
  it('retries a transport failure and returns the recovered response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(transportFailure('ECONNRESET'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const res = await fetchWithRetry('https://example.test/usage', {}, { maxAttempts: 2 })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws TransportError with the attempt count once retries are spent', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(transportFailure('ETIMEDOUT')))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const error: unknown = await fetchWithRetry('https://example.test/usage').catch(
      (cause: unknown) => cause,
    )

    expect(error).toBeInstanceOf(TransportError)
    if (!(error instanceof TransportError)) {
      throw new Error('expected TransportError')
    }
    expect(error.attempts).toBe(3)
    expect(error.message).toBe('请求失败（已尝试 3 次）: fetch failed <- (ETIMEDOUT)')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry an HTTP error response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchWithRetry('https://example.test/usage')

    expect(res.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('propagates a caller abort without retrying', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()

    const error: unknown = await fetchWithRetry(
      'https://example.test/usage',
      { signal: controller.signal },
      { maxAttempts: 1 },
    ).catch((cause: unknown) => cause)

    expect(error).not.toBeInstanceOf(TransportError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caps concurrent in-flight requests so a page fan-out cannot burst connections', async () => {
    // 每个 fetch 都挂起，由测试决定何时放行 —— 用「已启动的请求数」观察闸门，不依赖墙钟
    const started: (() => void)[] = []
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        peak = Math.max(peak, started.length + 1)
        return new Promise<Response>((resolve) => {
          started.push(() => {
            resolve(okResponse())
          })
        })
      }),
    )

    const results = Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        // 不同 host，单看全局上限；同 host 的上限由下一条用例覆盖
        fetchWithRetry(`https://h${String(index)}.example.test/usage`),
      ),
    )
    await flushMicrotasks(5)
    // 20 个请求同时发起，闸门只放行 8 个
    expect(started).toHaveLength(8)

    await drainWaves(started)

    expect(await results).toHaveLength(20)
    expect(peak).toBe(8)
  })

  it('caps same-host in-flight requests at 2 so one platform cannot open 5 sockets', async () => {
    const started: (() => void)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            started.push(() => {
              resolve(okResponse())
            })
          }),
      ),
    )

    // OpenCode Go 的 5 个 Key 就是这样同时发起的：同 host 只放行 2 条
    const results = Promise.all(
      Array.from({ length: 5 }, () => fetchWithRetry('https://opencode.test/zen/go/v1/usage')),
    )
    await flushMicrotasks(5)
    expect(started).toHaveLength(2)

    await drainWaves(started)

    expect(await results).toHaveLength(5)
    // 5 次建连全部发出，只是被分成 2 + 2 + 1 三波
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5)
  })

  it('does not let a saturated host starve the other hosts', async () => {
    const started: (() => void)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            started.push(() => {
              resolve(okResponse())
            })
          }),
      ),
    )

    const busy = Promise.all(
      Array.from({ length: 5 }, () => fetchWithRetry('https://busy.test/usage')),
    )
    await flushMicrotasks(5)
    // 同 host 上限 2：剩下 3 条在排队
    expect(started).toHaveLength(2)

    const others = Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        fetchWithRetry(`https://idle${String(index)}.test/u`),
      ),
    )
    await flushMicrotasks(5)
    // 排队中的 busy 请求不该占住全局槽：2 + 6 = 8，别的 host 一个都不挨饿
    expect(started).toHaveLength(8)

    await drainWaves(started)

    expect(await Promise.all([busy, others])).toHaveLength(2)
  })
})
