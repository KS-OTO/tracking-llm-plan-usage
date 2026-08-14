import { createAppHandler } from '../server/app.ts'

/**
 * Cloudflare Workers 入口。
 *
 * - /api/* 由 server/app.ts 处理（平台无关，Web Crypto 签名）
 * - 其余路径由 Workers Assets（env.ASSETS）托管 dist/ 构建产物
 * - 环境变量通过 Worker bindings 注入（wrangler secret / dashboard）
 *
 * 部署：bun run deploy（= vp build && wrangler deploy）
 */

interface WorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  [key: string]: unknown
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const handler = createAppHandler((key: string) => {
      const value = env[key]
      return typeof value === 'string' ? value : undefined
    })

    const apiResponse = await handler(request)
    if (apiResponse) {
      return apiResponse
    }
    return env.ASSETS.fetch(request)
  },
}
