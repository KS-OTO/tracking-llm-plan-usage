/**
 * EdgeOne Makers Cloud Function — /api/* catch-all.
 *
 * 复用平台无关的 server/app.ts（createAppHandler）：
 * - 前端 fetch('/api/...') 相对路径请求全部路由到本函数
 * - 环境变量通过 context.env 注入（Makers 控制台 EnvVars）
 * - 依赖打包：构建器自动编译并打包 server/*.ts（官方支持 TS）
 *
 * server 依赖链（zod 等）以动态 import 加载：失败时返回结构化诊断
 * （而非让函数在模块加载期裸崩、网关吐 5xx HTML），便于线上定位。
 */
export async function onRequest(context) {
  const { request, env } = context

  let createAppHandler
  try {
    ;({ createAppHandler } = await import('../../server/app.ts'))
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'FN_IMPORT_FAILED',
          message: `云函数依赖链加载失败：${String(error).slice(0, 400)}`,
        },
      },
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    )
  }

  const appHandler = createAppHandler((key) => env[key] ?? undefined)
  const response = await appHandler(request)
  return response ?? new Response('Not Found', { status: 404 })
}
