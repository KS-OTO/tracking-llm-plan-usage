import { z } from 'zod'

import type {
  AliyunPackagesResponse,
  BaiduQianfanResponse,
  OpenRouterDetailResponse,
  DeepSeekBalanceResponse,
  ExtrasResponse,
  GiteeBalanceResponse,
  InferenceUsageResponse,
  PlansResponse,
  StatusResponse,
  TokenPlanResponse,
  VolcPlanResponse,
  ZhipuPackagesResponse,
} from './types'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 后端错误信封（createAppHandler 的 errorResponse 契约）。 */
const ApiErrorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }).optional(),
})

/**
 * 同源后端（本仓库 server/app.ts）的响应负载 schema：
 * 错误契约运行时校验；业务字段与共享 types.ts 同构，组件侧防御性渲染兜底，
 * 因此负载本身声明为可信直通（z.custom）。
 */
async function get<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string | number>,
): Promise<T> {
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
    const envelope = ApiErrorEnvelope.safeParse(json)
    const error = envelope.success ? envelope.data.error : undefined
    throw new ApiError(
      error?.code ?? `HTTP_${res.status}`,
      error?.message ?? `请求失败 (${res.status})`,
    )
  }
  return schema.parse(json)
}

export const api = {
  status: () => get('/api/status', z.custom<StatusResponse>()),
  deepseekBalance: () => get('/api/deepseek/balance', z.custom<DeepSeekBalanceResponse>()),
  volcPlan: (days: number) => get('/api/volc/plan', z.custom<VolcPlanResponse>(), { days }),
  volcInference: (days: number, model?: string) =>
    get(
      '/api/volc/inference-usage',
      z.custom<InferenceUsageResponse>(),
      model ? { days, model } : { days },
    ),
  zhipuPackages: () => get('/api/zhipu/packages', z.custom<ZhipuPackagesResponse>()),
  aliyunPackages: (productCode?: string) =>
    get(
      '/api/aliyun/packages',
      z.custom<AliyunPackagesResponse>(),
      productCode ? { productCode } : undefined,
    ),
  aliyunTokenPlan: () => get('/api/aliyun/tokenplan', z.custom<TokenPlanResponse>()),
  giteeBalance: () => get('/api/gitee/balance', z.custom<GiteeBalanceResponse>()),
  baiduQianfan: () => get('/api/baidu/qianfan', z.custom<BaiduQianfanResponse>()),
  openrouterDetail: () => get('/api/openrouter/detail', z.custom<OpenRouterDetailResponse>()),
  extras: () => get('/api/extras', z.custom<ExtrasResponse>()),
  plans: () => get('/api/plans', z.custom<PlansResponse>()),
}
