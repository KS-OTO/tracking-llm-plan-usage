/**
 * 上游查询的 **TTL 缓存 + 单飞（single-flight）**。
 *
 * 动机见 issue #23：本项目托管在边缘云上，部分边缘平台按**节点生存时间**计费 ——
 * 端点越多、上游墙钟越长，节点存活越久。合并端点解决的是「唤醒次数」，
 * 这个模块解决的是另两个杠杆：
 *
 * 1. **命中缓存时上游调用数 25–35 → 接近 0** —— 一次刷新只花一次上游墙钟；
 * 2. **单飞** —— 多个标签页 / 多个人同时刷新时，同一份数据只打一次上游，
 *    而不是各打一次（对按调用计费的平台也是同一件事）。
 *
 * 粒度选在「**一个 provider 一次请求**」而不是「一个账号一次查询」：
 * provider 的 handler 一次就返回它名下全部账号，所以缓存 key 不需要账号维度，
 * 凭据轮换必然伴随进程重启（Bun / Workers 都如此），缓存自然失效。
 *
 * 缓存**不持久化、不跨进程**：Workers 的模块级状态是 per-isolate，
 * Bun 是 per-process。这是有意的 —— 边缘平台按存活时间计费，
 * 持久化反而会把「冷启动」变成常态。
 */

interface CacheEntry {
  /** 写入时刻（毫秒）。 */
  storedAt: number
  value: unknown
}

const entries = new Map<string, CacheEntry>()
/** 进行中的请求：同 key 的并发调用共享同一个 promise（单飞）。 */
const inflight = new Map<string, Promise<unknown>>()

/** 清空缓存与在途记录（单测用；也可在凭据热更新后调用）。 */
export function clearQueryCache(): void {
  entries.clear()
  inflight.clear()
}

/**
 * 读取缓存值时的类型不安全点（只有下面两处，均已就地标注）。
 *
 * 同一个 Map 要装 10 家平台的不同载荷，所以存的是 `unknown`；「key ↔ T 一一绑定」
 * 这个不变量由调用方保证（一个 key 只被一个 provider 使用，见 app.ts 的 `usage:${key}`）。
 * 之所以不抽成 `promote<T>(value: unknown): T` 这样的转发助手：`T` 在签名里只出现一次，
 * 会被 `no-unnecessary-type-parameters` 拦下（与 `sliceError` 同一个坑），
 * 而且抽出去只是把断言挪个位置，并没有让它变安全。
 */

/** 当前缓存条目数（诊断 / 单测用）。 */
export function queryCacheSize(): number {
  return entries.size
}

export interface CacheQueryOptions {
  /** 缓存存活秒数。传 0 表示**不缓存**（每次都打上游）。 */
  ttlSeconds: number
  /**
   * 手动刷新：跳过缓存读取，但**仍复用进行中的同 key 请求**并写回缓存。
   *
   * 复用而不是另起一路：一次「刷新」点击与上一次自动刷新相隔往往不到一秒，
   * 重打上游拿到的数据与在途的那次几乎必然一致，却要多付一次墙钟。
   */
  bypass?: boolean
}

/**
 * 带缓存地执行一次上游查询。
 *
 * 失败**不写缓存**（但会清掉在途记录）：把一次网络抖动缓存 60 秒，
 * 会让用户在此期间怎么刷新都修不好 —— 那比不打缓存更糟。
 */
export function cachedQuery<T>(
  key: string,
  options: CacheQueryOptions,
  load: () => Promise<T>,
): Promise<T> {
  const entry = entries.get(key)
  if (!options.bypass && entry && Date.now() - entry.storedAt < options.ttlSeconds * 1000) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上方「类型不安全点」说明
    return Promise.resolve(entry.value as T)
  }

  const running = inflight.get(key)
  if (running) {
    // 复用进行中的请求：同 key 的并发调用拿到的是同一个 promise
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上方「类型不安全点」说明
    return running as Promise<T>
  }

  const pending = load().then(
    (value): T => {
      // ttlSeconds <= 0 表示「不缓存」：只清在途记录，不写 entries
      // （写了会让 queryCacheSize 虚高，也会让「不缓存」这个契约名不副实）
      if (options.ttlSeconds > 0) {
        entries.set(key, { storedAt: Date.now(), value })
      }
      inflight.delete(key)
      return value
    },
    (cause: unknown): never => {
      inflight.delete(key)
      throw cause
    },
  )
  inflight.set(key, pending)
  return pending
}
