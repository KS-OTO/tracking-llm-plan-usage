import type { InferenceUsageResponse, StatusResponse, UsageResponse } from './types'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * 后端错误信封（`createAppHandler` 的 `errorResponse` 契约）：`{ error?: { code, message } }`。
 *
 * 手写收窄，与 `z.object({ error: z.object({ code: z.string(), message: z.string() }).optional() })`
 * **逐分支等价**：`error` 缺失 / 不是对象 / 是数组 / `code`、`message` 有一个不是字符串
 * → 一律视为「没有信封」，调用方回落到 HTTP 状态码。
 *
 * 之所以不上 zod：这是前端唯一的运行时校验点，而 zod 的默认导出会把整库带进客户端
 * （实测 +79.4 KB / gzip +24.1 KB），换来的却只是读两个字符串字段。
 */
function readErrorEnvelope(json: unknown): { code: string; message: string } | undefined {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return undefined
  }
  const { error } = json as { error?: unknown }
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return undefined
  }
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof code !== 'string' || typeof message !== 'string') {
    return undefined
  }
  return { code, message }
}

/**
 * 同源后端（本仓库 server/app.ts）的读取。
 *
 * **业务负载不做运行时校验**：它与 `types.ts` 同构（同一仓库的同一份契约），
 * 且组件侧一律按「字段恒存在的扁平对象」做防御性渲染兜底（缺字段取中性空值）。
 * 只有错误信封要校验，因为它的形状决定用户看到的是上游失败原因还是「HTTP 500」。
 * 负载本身声明为可信直通。
 */
async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new ApiError(
      'BACKEND_UNREACHABLE',
      `无法连接后端 API 服务（${window.location.origin}），请确认服务已启动（本地运行 bun run server 或 bun run dev）`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(await res.text())
  } catch {
    if (res.status >= 500) {
      throw new ApiError(
        'BACKEND_UNREACHABLE',
        '后端 API 服务异常（代理返回 5xx），请确认 bun run server 已启动',
      )
    }
    throw new ApiError(`HTTP_${res.status}`, `请求失败 (${res.status})`)
  }

  if (!res.ok) {
    const error = readErrorEnvelope(json)
    throw new ApiError(
      error?.code ?? `HTTP_${res.status}`,
      error?.message ?? `请求失败 (${res.status})`,
    )
  }
  // 读取负载时的类型不安全点（全仓唯一一处，与 server/cache.ts 同一手法）。
  // 不变量：同源后端（server/app.ts）与 src/types.ts 是同一份契约，「负载形状 = T」
  // 由同一个仓库保证；组件侧另有一层「字段恒存在的扁平对象」兜底，缺字段取中性空值。
  // 因此这里不做运行时校验 —— 校验保留给错误信封，只有它的形状决定用户看到什么。
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 见上方说明
  return json as T
}

/**
 * 同源后端（本仓库 server/app.ts）的 **3 个端点**（issue #23）。
 *
 * 合并端点的动机是边缘计费：托管平台按节点生存时间计费，唤醒次数越少越好。
 * 因此不要为了「顺手」再加单个平台的端点 —— 新平台请加进 `/api/usage` 的 provider 表。
 */
export const api = {
  /** 首屏：品牌 / favicon / 刷新节奏 / 半配置提示。0 次上游调用。 */
  status: () => get<StatusResponse>('/api/status'),
  /**
   * 每刷新一次：9 家平台的读数一次返回（每格仍是独立容错切片）。
   *
   * `refresh` 为 true 时服务端**跳过 TTL 缓存**（手动刷新拿实时数据），
   * 自动刷新则吃缓存以省下上游墙钟。
   */
  usage: (refresh = false) =>
    get<UsageResponse>('/api/usage', refresh ? { refresh: 1 } : undefined),
  /**
   * 火山推理用量：**唯一的按需端点**。
   *
   * 它带用户输入的 `model` / `modelEndpoint` 过滤，合并进 `/api/usage` 会让
   * 「换一个模型」退化成「全量重拉 9 家平台」。
   */
  volcInference: (days: number, model?: string, refresh = false) =>
    get<InferenceUsageResponse>('/api/volc/inference-usage', {
      days,
      ...(model ? { model } : {}),
      ...(refresh ? { refresh: 1 } : {}),
    }),
}
