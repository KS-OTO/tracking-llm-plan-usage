import { defineConfig } from '@playwright/test'

/**
 * 服务端会读取的**全部**环境变量名（`server/app.ts` 里 readKeys / readKeyPairs /
 * readPairedMap / labelMap 的参数并集，均不含 `_N` 后缀）。
 *
 * 为什么必须逐字登记：`vite.config.ts` 用 `loadEnv(cwd, '', '')` —— **空前缀**加载本机
 * `.env`，因此任何没被置空的变量都会带着真实凭据进入测试服务器。
 * 症状极具误导性：`/api/status` 的 configured 变成 true、`/api/newapi` 返回 200 而不是 503，
 * 表现为「密封环境的空态断言莫名其妙失败」，而报错位置离这里很远。
 * （New API 接入时就漏登记过 NEWAPI_* 三个变量，本机 `.env` 配上真实站点即复现。）
 *
 * 新增平台时**必须**把新的变量名加进来；`dashboard smoke › api status returns 200
 * and providers report unconfigured` 是这条规则的兜底断言。
 */
const SERVER_ENV_VARS = [
  // 单 Key 平台
  'DEEPSEEK_API_KEY',
  'ZHIPU_API_KEY',
  'GITEE_AI_API_KEY',
  'STEPFUN_API_KEY',
  'SILICONFLOW_API_KEY',
  'OPENROUTER_API_KEY',
  'NOVITA_API_KEY',
  'KIMI_API_KEY',
  'MINIMAX_API_KEY',
  'OPENCODE_GO_API_KEY',
  // 成对凭据（访问密钥 + 密钥 / 站点地址 + 令牌）
  'VOLC_ACCESS_KEY_ID',
  'VOLC_SECRET_KEY',
  'ALIYUN_ACCESS_KEY_ID',
  'ALIYUN_SECRET_KEY',
  'BAIDU_ACCESS_KEY_ID',
  'BAIDU_SECRET_KEY',
  'NEWAPI_BASE_URL',
  'NEWAPI_TOKEN',
  // 站点自定义：不改鉴权，但会改品牌文案与刷新节奏，留着同样会污染断言
  'SITE_NAME',
  'SITE_LOGO_URL',
  'SITE_FAVICON_URL',
  'REFRESH_INTERVAL_SECONDS',
  // 可选旁路凭据（会话 Cookie / 请求头），单独配置即可生效
  'GITEE_AI_SESSION_COOKIE',
  'ALIYUN_TOKENPLAN_COOKIE',
  'NEWAPI_USER_ID',
  // 账号别名：不影响鉴权，但会改变卡片标题，留着同样会污染断言
  'DEEPSEEK_LABEL',
  'VOLC_LABEL',
  'ZHIPU_LABEL',
  'ALIYUN_LABEL',
  'GITEE_LABEL',
  'STEPFUN_LABEL',
  'SILICONFLOW_LABEL',
  'OPENROUTER_LABEL',
  'NOVITA_LABEL',
  'KIMI_LABEL',
  'MINIMAX_LABEL',
  'OPENCODE_GO_LABEL',
  'BAIDU_LABEL',
  'NEWAPI_LABEL',
  'ALIYUN_TOKENPLAN_LABEL',
]

/** 构造无凭据环境：置空上面列出的全部变量（含多账号 `_2.._9` 后缀）。 */
function hermeticEnv(): Record<string, string> {
  const cleared: Record<string, string> = {}
  for (const name of SERVER_ENV_VARS) {
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
