import { defineConfig } from '@playwright/test'

import { SERVER_ENV_VARS } from './server/env-vars.ts'

/**
 * 构造无凭据环境：跳过本机 `.env`（`SKIP_DOTENV=1`，见 vite.config.ts），
 * 并把上面列出的变量置空兜底（防开发者 shell / 系统环境里带着真实值）。
 *
 * `SITE_NAME` 是唯一的例外，**不能置空**：空串在本项目里是「显式留空 → 品牌位只显示
 * Logo」（`SITE_NAME=`），拿它当「删掉这个变量」用会把测试的意图悄悄改写 ——
 * 密封环境本该看到默认站点名 `LLM 用量监控`，置空后渲染的是一个没有文字的品牌位。
 * 跳过 `.env` 之后，「未配置」本身就是 `undefined`，不再需要置空来表达。
 */
function hermeticEnv(): Record<string, string> {
  const cleared: Record<string, string> = { SKIP_DOTENV: '1' }
  for (const name of SERVER_ENV_VARS) {
    if (name === 'SITE_NAME') {
      continue
    }
    cleared[name] = ''
    for (let i = 2; i <= 9; i++) {
      cleared[`${name}_${i}`] = ''
    }
  }
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[name] = value
    }
  }
  return { ...env, ...cleared }
}

/**
 * E2E 冒烟：启动 vp dev（内置 /api），无任何 provider key，
 * 验证空态/加载/响应式/暗色切换/回到顶部。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
  },
  webServer: {
    command: 'bunx vp dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    // 密封性优先：绝不复用已有 dev server（其可能带真实密钥，破坏空态断言）
    reuseExistingServer: false,
    timeout: 120_000,
    env: hermeticEnv(),
  },
})
