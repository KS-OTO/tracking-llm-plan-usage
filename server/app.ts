/**
 * 平台无关的 API 处理核心。
 *
 * 通过 createAppHandler(env) 构建请求处理器：
 * - Bun 入口（server/index.ts）：Bun.serve + 静态资源
 * - Cloudflare Workers 入口（worker/index.ts）：env.ASSETS 静态资源
 * - Vite dev 中间件（vite.config.ts）：开发模式单进程
 *
 * 环境变量通过 EnvGetter 抽象注入（Bun: process.env；Worker: bindings）。
 */
import {
  fetchNovitaBalance,
  fetchOpenRouterBalance,
  fetchSiliconFlowBalance,
  fetchStepFunBalance,
  type BalanceInfo,
} from './balances.ts'
import { queryResourcePackageInstances, type AliyunCredentials } from './aliyun.ts'
import { fetchDeepSeekBalance } from './deepseek.ts'
import { fetchGiteePackageBalance } from './gitee.ts'
import { fetchKimiPlan, fetchMiniMaxPlan, type TokenPlanInfo } from './plans.ts'
import { readKeyPairs, readKeys, type EnvGetter } from './multi.ts'
import { getTokenPlanAccount, getTokenPlanSeats, getTokenPlanSharedPackages } from './tokenplan.ts'
import { getZhipuAccountBalance, getZhipuCodingPlanQuota, getZhipuTokenPackages } from './zhipu.ts'
import {
  getAfpUsage,
  getCodingPlanUsage,
  getUsageDetails,
  getInferenceUsage,
  type VolcCredentials,
} from './volc.ts'

/**
 * LLM 用量监控 server.
 *
 * Reads provider credentials from environment variables:
 *   DEEPSEEK_API_KEY        DeepSeek API key (余额查询)
 *   VOLC_ACCESS_KEY_ID      火山方舟 Access Key ID（管控面 API）
 *   VOLC_SECRET_KEY         火山方舟 Secret Access Key
 *   ZHIPU_API_KEY           智谱开放平台 API Key（资源包/余额）
 *   ALIYUN_ACCESS_KEY_ID    阿里云 AccessKey ID（BSS 资源包）
 *   ALIYUN_SECRET_KEY       阿里云 AccessKey Secret
 *   HOST / PORT             监听地址（默认 127.0.0.1:8787）
 *
 * Serves the built frontend from dist/ plus /api/* endpoints.
 * Dev mode: run `vp dev` (Vite proxies /api to this server).
 */

// 多账号：每个平台支持 N 组凭据（基础变量为第 1 组，`_2`、`_3`… 为后续组）
export function createAppHandler(env: EnvGetter) {
  // 多账号：每个平台支持 N 组凭据（基础变量为第 1 组，`_2`、`_3`… 为后续组）
  const DEEPSEEK_KEYS = readKeys('DEEPSEEK_API_KEY', env)
  const ZHIPU_KEYS = readKeys('ZHIPU_API_KEY', env)
  const GITEE_AI_KEYS = readKeys('GITEE_AI_API_KEY', env)
  const STEPFUN_KEYS = readKeys('STEPFUN_API_KEY', env)
  const SILICONFLOW_KEYS = readKeys('SILICONFLOW_API_KEY', env)
  const OPENROUTER_KEYS = readKeys('OPENROUTER_API_KEY', env)
  const NOVITA_KEYS = readKeys('NOVITA_API_KEY', env)
  const KIMI_KEYS = readKeys('KIMI_API_KEY', env)
  const MINIMAX_KEYS = readKeys('MINIMAX_API_KEY', env)

  const volcCredentialsList: VolcCredentials[] = readKeyPairs(
    'VOLC_ACCESS_KEY_ID',
    'VOLC_SECRET_KEY',
    env,
  ).map((pair) => ({ accessKey: pair.key, secretKey: pair.secret }))

  const aliyunCredentialsList: AliyunCredentials[] = readKeyPairs(
    'ALIYUN_ACCESS_KEY_ID',
    'ALIYUN_SECRET_KEY',
    env,
  ).map((pair) => ({ accessKey: pair.key, secretKey: pair.secret }))

  function maskKey(key: string): string {
    if (key.length <= 8) {
      return '****'
    }
    return `${key.slice(0, 4)}****${key.slice(-4)}`
  }

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  /** 常见错误码的中文说明，原始英文信息保留在 message 中供诊断。 */
  const ERROR_HINTS: Record<string, string> = {
    NOT_CONFIGURED: '未配置对应密钥',
    NetworkError: '网络请求失败',
    NotAuthorized: '无访问权限（RAM 策略不足）',
    InvalidAccessKeyId: 'AccessKey 不存在或无效',
    'InvalidAccessKeyId.NotFound': 'AccessKey 不存在或无效',
    SignatureDoesNotMatch: '签名不匹配',
    InvalidResponse: '供应商返回了无法解析的响应',
    ENDPOINT_GONE: '接口已下线',
  }

  function errorResponse(status: number, code: string, message: string): Response {
    const hint = ERROR_HINTS[code]
    const displayMessage = hint && hint !== message ? `${hint}：${message}` : message
    return json({ error: { code, message: displayMessage } }, status)
  }

  function dateRange(daysParam: string | null): { start: string; end: string } {
    const days = Math.min(90, Math.max(1, Number(daysParam ?? 7) || 7))
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))
    const format = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return { start: format(start), end: format(end) }
  }

  // ---------------------------------------------------------------------------
  // API handlers
  // ---------------------------------------------------------------------------

  interface AccountEntry<T> {
    keyHint: string
    run: () => Promise<T>
  }

  type AccountResult<T> = T & { keyHint: string; error?: string }

  /** 并行执行多账号查询，每个账号独立容错，返回含 keyHint 的结果数组。 */
  async function runAccounts<T>(entries: AccountEntry<T>[]): Promise<AccountResult<T>[]> {
    const results = await Promise.allSettled(entries.map((entry) => entry.run()))
    return results.map((result, index) => {
      const { keyHint } = entries[index]
      if (result.status === 'fulfilled') {
        return { keyHint, ...result.value }
      }
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
      return { keyHint, error: reason } as AccountResult<T>
    })
  }

  function providerStatus(keyHints: string[]): {
    configured: boolean
    count: number
    keyHints: string[]
  } {
    return { configured: keyHints.length > 0, count: keyHints.length, keyHints }
  }

  function handleStatus(): Response {
    return json({
      providers: {
        deepseek: providerStatus(DEEPSEEK_KEYS.map(maskKey)),
        volc: providerStatus(volcCredentialsList.map((cred) => maskKey(cred.accessKey))),
        zhipu: providerStatus(ZHIPU_KEYS.map(maskKey)),
        aliyun: providerStatus(aliyunCredentialsList.map((cred) => maskKey(cred.accessKey))),
        gitee: providerStatus(GITEE_AI_KEYS.map(maskKey)),
      },
      now: Date.now(),
    })
  }

  async function handleExtras(): Promise<Response> {
    const balanceGroups: Array<{ provider: string; entries: AccountEntry<BalanceInfo>[] }> = [
      {
        provider: 'StepFun 阶跃星辰',
        entries: STEPFUN_KEYS.map((key) => ({
          keyHint: maskKey(key),
          run: () => fetchStepFunBalance(key),
        })),
      },
      {
        provider: 'SiliconFlow 硅基流动',
        entries: SILICONFLOW_KEYS.map((key) => ({
          keyHint: maskKey(key),
          run: () => fetchSiliconFlowBalance(key),
        })),
      },
      {
        provider: 'OpenRouter',
        entries: OPENROUTER_KEYS.map((key) => ({
          keyHint: maskKey(key),
          run: () => fetchOpenRouterBalance(key),
        })),
      },
      {
        provider: 'Novita AI',
        entries: NOVITA_KEYS.map((key) => ({
          keyHint: maskKey(key),
          run: () => fetchNovitaBalance(key),
        })),
      },
    ].filter((group) => group.entries.length > 0)

    const planGroups: Array<{ provider: string; entries: AccountEntry<TokenPlanInfo>[] }> = [
      {
        provider: 'Kimi For Coding',
        entries: KIMI_KEYS.map((key) => ({ keyHint: maskKey(key), run: () => fetchKimiPlan(key) })),
      },
      {
        provider: 'MiniMax',
        entries: MINIMAX_KEYS.map((key) => ({
          keyHint: maskKey(key),
          run: () => fetchMiniMaxPlan(key),
        })),
      },
    ].filter((group) => group.entries.length > 0)

    const [balanceGroupsResult, planGroupsResult] = await Promise.all([
      Promise.all(
        balanceGroups.map(async (group) => ({
          provider: group.provider,
          accounts: await runAccounts(group.entries),
        })),
      ),
      Promise.all(
        planGroups.map(async (group) => ({
          provider: group.provider,
          accounts: await runAccounts(group.entries),
        })),
      ),
    ])

    const configured =
      balanceGroups.reduce((sum, group) => sum + group.entries.length, 0) +
      planGroups.reduce((sum, group) => sum + group.entries.length, 0)

    return json({ balances: balanceGroupsResult, plans: planGroupsResult, configured })
  }

  async function handleGiteeBalance(): Promise<Response> {
    if (GITEE_AI_KEYS.length === 0) {
      return errorResponse(503, 'NOT_CONFIGURED', '未配置 GITEE_AI_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      GITEE_AI_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        run: () => fetchGiteePackageBalance(apiKey),
      })),
    )
    return json({ accounts })
  }

  async function handleDeepseekBalance(): Promise<Response> {
    if (DEEPSEEK_KEYS.length === 0) {
      return errorResponse(503, 'NOT_CONFIGURED', '未配置 DEEPSEEK_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      DEEPSEEK_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        run: () => fetchDeepSeekBalance(apiKey),
      })),
    )
    return json({ accounts })
  }

  async function handleVolcPlan(requestUrl: URL): Promise<Response> {
    if (volcCredentialsList.length === 0) {
      return errorResponse(
        503,
        'NOT_CONFIGURED',
        '未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY 环境变量',
      )
    }
    const { start, end } = dateRange(requestUrl.searchParams.get('days'))
    const accounts = await runAccounts(
      volcCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        run: async () => {
          const [afp, details, codingPlan] = await Promise.all([
            getAfpUsage(creds),
            getUsageDetails(creds, start, end),
            getCodingPlanUsage(creds),
          ])
          return {
            planType: afp.planType,
            windows: afp.windows,
            details,
            detailsStart: start,
            detailsEnd: end,
            codingPlan,
          }
        },
      })),
    )
    return json({ accounts })
  }

  async function handleZhipu(): Promise<Response> {
    if (ZHIPU_KEYS.length === 0) {
      return errorResponse(503, 'NOT_CONFIGURED', '未配置 ZHIPU_API_KEY 环境变量')
    }
    const accounts = await runAccounts(
      ZHIPU_KEYS.map((apiKey) => ({
        keyHint: maskKey(apiKey),
        run: async () => {
          const [codingPlan, balance, packages] = await Promise.all([
            getZhipuCodingPlanQuota(apiKey),
            getZhipuAccountBalance(apiKey),
            getZhipuTokenPackages(apiKey),
          ])
          return { codingPlan, balance, packages }
        },
      })),
    )
    return json({ accounts })
  }

  async function handleAliyun(requestUrl: URL): Promise<Response> {
    if (aliyunCredentialsList.length === 0) {
      return errorResponse(
        503,
        'NOT_CONFIGURED',
        '未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY 环境变量',
      )
    }
    const productCode = requestUrl.searchParams.get('productCode')?.trim() || undefined
    const accounts = await runAccounts(
      aliyunCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        run: () => queryResourcePackageInstances(creds, { productCode }),
      })),
    )
    return json({ accounts })
  }

  async function handleTokenPlan(): Promise<Response> {
    if (aliyunCredentialsList.length === 0) {
      return errorResponse(
        503,
        'NOT_CONFIGURED',
        '未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY 环境变量',
      )
    }
    const accounts = await runAccounts(
      aliyunCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        run: async () => {
          const [account, seats, sharedPackages] = await Promise.all([
            getTokenPlanAccount(creds),
            getTokenPlanSeats(creds),
            getTokenPlanSharedPackages(creds),
          ])
          return { account, seats, sharedPackages }
        },
      })),
    )
    return json({ accounts })
  }

  async function handleVolcInference(requestUrl: URL): Promise<Response> {
    if (volcCredentialsList.length === 0) {
      return errorResponse(
        503,
        'NOT_CONFIGURED',
        '未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY 环境变量',
      )
    }
    const { start, end } = dateRange(requestUrl.searchParams.get('days'))
    const model = requestUrl.searchParams.get('model')?.trim() || undefined
    const modelEndpoint = requestUrl.searchParams.get('modelEndpoint')?.trim() || undefined

    const filters: Array<{ key: string; values: string[] }> = []
    if (model) {
      filters.push({ key: 'ModelName', values: [model] })
    }
    if (modelEndpoint) {
      filters.push({ key: 'ModelEndpoint', values: [modelEndpoint] })
    }

    const accounts = await runAccounts(
      volcCredentialsList.map((creds) => ({
        keyHint: maskKey(creds.accessKey),
        run: async () => {
          const usage = await getInferenceUsage(creds, start, end, filters)
          return { rows: usage.rows, start, end }
        },
      })),
    )
    return json({ accounts })
  }

  // ---------------------------------------------------------------------------
  // 请求分发：/api/* 返回 API 响应；其余路径返回 null（由宿主处理静态资源）
  // ---------------------------------------------------------------------------

  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/status') {
        return handleStatus()
      }
      if (url.pathname === '/api/deepseek/balance') {
        return await handleDeepseekBalance()
      }
      if (url.pathname === '/api/volc/plan') {
        return await handleVolcPlan(url)
      }
      if (url.pathname === '/api/volc/inference-usage') {
        return await handleVolcInference(url)
      }
      if (url.pathname === '/api/zhipu/packages') {
        return await handleZhipu()
      }
      if (url.pathname === '/api/aliyun/packages') {
        return await handleAliyun(url)
      }
      if (url.pathname === '/api/aliyun/tokenplan') {
        return await handleTokenPlan()
      }
      if (url.pathname === '/api/gitee/balance') {
        return await handleGiteeBalance()
      }
      if (url.pathname === '/api/extras') {
        return await handleExtras()
      }
      if (url.pathname.startsWith('/api/')) {
        return errorResponse(404, 'NOT_FOUND', `未知接口: ${url.pathname}`)
      }
      return null
    } catch (error) {
      console.error(`[app] ${request.method} ${url.pathname} failed:`, error)
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}
