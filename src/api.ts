import type {
  AliyunPackagesResponse,
  DeepSeekBalanceResponse,
  ExtrasResponse,
  GiteeBalanceResponse,
  InferenceUsageResponse,
  StatusResponse,
  TokenPlanResponse,
  VolcPlanResponse,
  ZhipuPackagesResponse,
  ApiErrorPayload,
} from './types'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

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
      '无法连接后端 API 服务（127.0.0.1:8787），请先运行 bun run server（或 bun run dev:all 一键启动）',
    )
  }

  let body: T & ApiErrorPayload
  try {
    body = (await res.json()) as T & ApiErrorPayload
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
    throw new ApiError(
      body.error?.code ?? `HTTP_${res.status}`,
      body.error?.message ?? `请求失败 (${res.status})`,
    )
  }
  return body
}

export const api = {
  status: () => get<StatusResponse>('/api/status'),
  deepseekBalance: () => get<DeepSeekBalanceResponse>('/api/deepseek/balance'),
  volcPlan: (days: number) => get<VolcPlanResponse>('/api/volc/plan', { days }),
  volcInference: (days: number, model?: string) =>
    get<InferenceUsageResponse>('/api/volc/inference-usage', model ? { days, model } : { days }),
  zhipuPackages: () => get<ZhipuPackagesResponse>('/api/zhipu/packages'),
  aliyunPackages: (productCode?: string) =>
    get<AliyunPackagesResponse>('/api/aliyun/packages', productCode ? { productCode } : undefined),
  aliyunTokenPlan: () => get<TokenPlanResponse>('/api/aliyun/tokenplan'),
  giteeBalance: () => get<GiteeBalanceResponse>('/api/gitee/balance'),
  extras: () => get<ExtrasResponse>('/api/extras'),
}
