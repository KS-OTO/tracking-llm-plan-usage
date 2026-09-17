import type { NextFunction } from 'connect'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, lazyPlugins, type Plugin } from 'vite-plus'
import { loadEnv } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

import { createAppHandler } from './server/app.ts'

/**
 * 开发模式下服务端读到的环境变量：本机 `.env` 打底，`process.env` 覆盖。
 *
 * `SKIP_DOTENV=1` 时**完全跳过** `.env` 文件，只认 `process.env` —— E2E 密封环境用
 * （见 playwright.config.ts 的 hermeticEnv）。
 *
 * 密封环境为什么必须绕过 `.env`，而不是像以前那样「把变量逐个置空」：
 * 站点自定义里**空串是有含义的** —— `SITE_NAME=` 表示「品牌位只显示 Logo」，
 * 于是「置空」这个动作同时表达了两件互斥的事：测试想说的是「没配过」，
 * 服务端读到的是「显式留空」。结果 E2E 里断言默认站点名会莫名其妙地找不到元素
 * （`LLM 用量监控` 从未渲染），而报错位置离这里很远。跳过文件后，
 * 「没配」才真的等于 `undefined`。
 */
function resolveServerEnv(): Record<string, string | undefined> {
  if (process.env.SKIP_DOTENV === '1') {
    return { ...process.env }
  }
  return { ...loadEnv(process.cwd(), '', ''), ...process.env }
}

/**
 * 开发模式内置 API 服务：把 server/app.ts 挂进 Vite dev server，
 * `vp dev` 单进程即可同时提供前端与 /api/*，无需另开后端。
 */
function apiMiddleware(): Plugin {
  return {
    name: 'llm-usage-api',
    configureServer(server) {
      const env = resolveServerEnv()
      const handler = createAppHandler((key) => env[key])
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          next()
          return
        }
        void handleApi(req, res, next)
      })

      async function handleApi(
        req: IncomingMessage,
        res: ServerResponse,
        next: NextFunction,
      ): Promise<void> {
        try {
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') {
              headers.set(name, value)
            } else if (Array.isArray(value)) {
              for (const item of value) {
                headers.append(name, item)
              }
            }
          }
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
          })
          const response = await handler(request)
          if (!response) {
            next()
            return
          }
          res.statusCode = response.status
          for (const [name, value] of response.headers) {
            res.setHeader(name, value)
          }
          res.end(await response.text())
        } catch (error) {
          console.error('[llm-usage-api] failed:', error)
          res.statusCode = 500
          res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: String(error) } }))
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  lint: {
    plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'vue', 'vitest'],
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    env: {
      browser: true,
      builtin: true,
    },
    ignorePatterns: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '.wrangler/**'],
    rules: {
      'no-array-constructor': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    overrides: [
      {
        files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.vue'],
        rules: {
          'constructor-super': 'off',
          'getter-return': 'off',
          'no-class-assign': 'off',
          'no-const-assign': 'off',
          'no-dupe-class-members': 'off',
          'no-dupe-keys': 'off',
          'no-func-assign': 'off',
          'no-import-assign': 'off',
          'no-new-native-nonconstructor': 'off',
          'no-obj-calls': 'off',
          'no-redeclare': 'off',
          'no-setter-return': 'off',
          'no-this-before-super': 'off',
          'no-undef': 'off',
          'no-unreachable': 'off',
          'no-unsafe-negation': 'off',
          'no-var': 'error',
          'no-with': 'off',
          'prefer-const': 'error',
          'prefer-rest-params': 'error',
          'prefer-spread': 'error',
        },
      },
      {
        files: ['src/**/*.test.ts', 'server/**/*.test.ts'],
        rules: {
          'vitest/expect-expect': 'error',
          'vitest/no-commented-out-tests': 'error',
          'vitest/no-conditional-expect': 'error',
          'vitest/no-disabled-tests': 'warn',
          'vitest/no-focused-tests': 'error',
          'vitest/no-identical-title': 'error',
          'vitest/no-import-node-test': 'error',
          'vitest/no-interpolation-in-snapshots': 'error',
          'vitest/no-mocks-import': 'error',
          'vitest/no-standalone-expect': 'error',
          'vitest/no-unneeded-async-expect-function': 'error',
          'vitest/prefer-called-exactly-once-with': 'error',
          'vitest/require-local-test-context-for-concurrent-snapshots': 'error',
          'vitest/valid-describe-callback': 'error',
          'vitest/valid-expect': 'error',
          'vitest/valid-expect-in-promise': 'error',
          'vitest/valid-title': 'error',
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: true,
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: [],
  },
  plugins: lazyPlugins(() => [apiMiddleware(), vue(), vueDevTools()]),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
