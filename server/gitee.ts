/**
 * 模力方舟（Gitee AI）开放接口客户端。
 *
 * - OpenAPI 规范：https://ai.gitee.com/v1/yaml（Base URL: https://ai.gitee.com/v1）
 * - 文档：https://ai.gitee.com/docs/openapi/v1
 * - 鉴权：Authorization: Bearer <访问令牌>
 *
 * 用量/余额：
 *   GET /tokens/packages/balance —— 查询访问令牌所授权资源包的余额
 *   （响应：total_amount / used_amount / balance / details[]）
 */

const GITEE_AI_BASE_URL = 'https://ai.gitee.com/v1'

export class GiteeAiApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface GiteePackageDetail {
  ident: string
  name: string
  amount: number
  balance: number
}

export interface GiteePackageBalance {
  totalAmount: number
  usedAmount: number
  balance: number
  details: GiteePackageDetail[]
}

interface GiteeBalanceResponse {
  total_amount?: number
  used_amount?: number
  balance?: number
  details?: Array<{
    ident?: string
    name?: string
    amount?: number
    balance?: number
  }>
}

/** GET /tokens/packages/balance —— 资源包余额。 */
export async function fetchGiteePackageBalance(apiKey: string): Promise<GiteePackageBalance> {
  let res: Response
  try {
    res = await fetch(`${GITEE_AI_BASE_URL}/tokens/packages/balance`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
    })
  } catch (cause) {
    throw new GiteeAiApiError('NetworkError', `请求模力方舟失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new GiteeAiApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }

  const body = json as GiteeBalanceResponse & { error?: { code?: string; message?: string } }
  if (!res.ok) {
    const code = body.error?.code ?? `HTTP_${res.status}`
    const message = body.error?.message ?? text.slice(0, 200)
    throw new GiteeAiApiError(code, message)
  }

  return {
    totalAmount: Number(body.total_amount ?? 0),
    usedAmount: Number(body.used_amount ?? 0),
    balance: Number(body.balance ?? 0),
    details: (body.details ?? []).map((entry) => ({
      ident: entry.ident ?? '',
      name: entry.name ?? '',
      amount: Number(entry.amount ?? 0),
      balance: Number(entry.balance ?? 0),
    })),
  }
}
