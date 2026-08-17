import { defineConfig } from '@playwright/test'

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

/** 构造无密钥环境：覆盖全部 provider key（含多账号 _2.._9 后缀）与会话 Cookie。 */
function hermeticEnv(): Record<string, string> {
  const cleared: Record<string, string> = {}
  const prefixes = [
    'DEEPSEEK_API_KEY',
    'VOLC_ACCESS_KEY_ID',
    'VOLC_SECRET_KEY',
    'ZHIPU_API_KEY',
    'ALIYUN_ACCESS_KEY_ID',
    'ALIYUN_SECRET_KEY',
    'GITEE_AI_API_KEY',
    'GITEE_AI_SESSION_COOKIE',
    'STEPFUN_API_KEY',
    'SILICONFLOW_API_KEY',
    'OPENROUTER_API_KEY',
    'NOVITA_API_KEY',
    'KIMI_API_KEY',
    'MINIMAX_API_KEY',
  ]
  for (const prefix of prefixes) {
    cleared[prefix] = ''
    for (let i = 2; i <= 9; i++) {
      cleared[`${prefix}_${i}`] = ''
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
