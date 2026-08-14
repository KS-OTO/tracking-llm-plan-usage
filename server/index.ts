import { fileURLToPath } from 'node:url'

import { createAppHandler } from './app.ts'

/**
 * Bun 入口：Bun.serve 托管 API（server/app.ts）与 dist/ 静态资源。
 * 环境变量读取 process.env（多账号见 server/multi.ts）。
 */

const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = Number(process.env.PORT ?? 8787)

const appHandler = createAppHandler((key: string) => {
  const value = process.env[key]
  return value === undefined ? undefined : value
})

// ---------------------------------------------------------------------------
// Static file serving (production build in dist/)
// ---------------------------------------------------------------------------

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

async function serveStatic(pathname: string): Promise<Response> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  if (relative.includes('..') || relative.includes('\\')) {
    return new Response('Forbidden', { status: 403 })
  }

  const file = Bun.file(DIST_DIR + relative)
  if (await file.exists()) {
    const extension = relative.slice(relative.lastIndexOf('.'))
    return new Response(file, {
      headers: { 'content-type': MIME_TYPES[extension] ?? 'application/octet-stream' },
    })
  }

  if (!relative.includes('.')) {
    const indexFile = Bun.file(DIST_DIR + 'index.html')
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
  }

  return new Response('Not Found', { status: 404 })
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  // 外部供应商 API 冷连接可能超过默认 10s，放宽到 60s
  idleTimeout: 60,
  async fetch(request) {
    const url = new URL(request.url)
    const apiResponse = await appHandler(request)
    if (apiResponse) {
      return apiResponse
    }
    return await serveStatic(url.pathname)
  },
})

console.log(`[llm-usage-monitor] listening on http://${server.hostname}:${server.port}`)
