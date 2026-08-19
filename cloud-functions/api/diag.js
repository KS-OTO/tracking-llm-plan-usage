/**
 * 云函数运行时自诊断（零依赖，不经过 server/*.ts 依赖链）。
 *
 * 用途：线上 /api/* 异常时访问 /api/diag 区分
 * 「函数系统故障」与「依赖链（zod 等）加载失败」。
 */
export async function onRequest(context) {
  const { request, env } = context
  const checks = {}

  checks.node = process.version
  try {
    const mod = await import('zod')
    checks.zod = mod && mod.z ? 'ok' : 'imported-but-no-z-export'
  } catch (error) {
    checks.zod = `FAIL: ${String(error).slice(0, 300)}`
  }
  checks.envKeys = Object.keys(env ?? {})
    .filter((key) => !key.startsWith('_'))
    .map((key) => (key.includes('SECRET') || key.includes('KEY') ? `${key}:<set>` : key))

  return Response.json(
    { ok: true, url: request.url, checks, now: Date.now() },
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  )
}
