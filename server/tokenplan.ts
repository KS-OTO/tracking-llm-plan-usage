import { signAliyunRoa, type AliyunCredentials } from './aliyun.ts'

/**
 * 阿里云 Model Studio Token Plan 客户端（ROA 风格 OpenAPI）。
 *
 * API 列表与文档：
 * - GetTokenPlanAccountDetail      GET /tokenplan/account
 * - GetSubscriptionSeatDetails     GET /tokenplan/subscription/seat-detail
 * - GetSubscriptionStats           GET /tokenplan/subscription/stats
 * - ListSubscriptionSharedPackages GET /tokenplan/subscription/shared-packages
 *
 * 使用 RAM 内置策略 AliyunTokenPlanReadOnlyAccess 授权的只读接口。
 * 签名实现（ROA + Date 头 + acs Authorization）已经 modelstudio 网关实测验证。
 */

const ENDPOINT = 'https://modelstudio.cn-beijing.aliyuncs.com'
const VERSION = '2026-02-10'

export class TokenPlanApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

interface TokenPlanResponse {
  Success?: boolean
  Code?: string
  Message?: string
  Data?: unknown
}

async function tokenPlanGet(
  creds: AliyunCredentials,
  action: string,
  path: string,
  query?: Record<string, string>,
): Promise<TokenPlanResponse> {
  const date = new Date().toUTCString()
  const xAcsHeaders: Record<string, string> = {
    'x-acs-action': action,
    'x-acs-signature-method': 'HMAC-SHA1',
    'x-acs-signature-nonce': crypto.randomUUID(),
    'x-acs-signature-version': '1.0',
    'x-acs-version': VERSION,
  }
  const signature = await signAliyunRoa({
    method: 'GET',
    path,
    query,
    xAcsHeaders,
    date,
    secretKey: creds.secretKey,
  })

  let res: Response
  try {
    const queryString = new URLSearchParams(query ?? {}).toString()
    res = await fetch(`${ENDPOINT}${path}${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        date,
        ...xAcsHeaders,
        authorization: `acs ${creds.accessKey}:${signature}`,
      },
    })
  } catch (cause) {
    throw new TokenPlanApiError(
      'NetworkError',
      `请求 Model Studio Token Plan 失败: ${String(cause)}`,
    )
  }

  const text = await res.text()
  let json: TokenPlanResponse
  try {
    json = JSON.parse(text) as TokenPlanResponse
  } catch {
    throw new TokenPlanApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }

  if (!res.ok || json.Success === false) {
    throw new TokenPlanApiError(
      json.Code ?? `HTTP_${res.status}`,
      json.Message ?? text.slice(0, 200),
    )
  }
  return json
}

// ---------------------------------------------------------------------------
// 类型与归一化
// ---------------------------------------------------------------------------

export interface TokenPlanOrg {
  orgId: string
  roleCode: string
  workspaces: Array<{ workspaceId: string; roleCode: string }>
}

export interface TokenPlanAccount {
  accountId: string
  aliyunUid: string
  name: string
  accountType: string
  orgs: TokenPlanOrg[]
}

export interface EquityQuota {
  equityType: string
  cycleStartTime: number
  cycleEndTime: number
  cycleTotalValue: number
  cycleSurplusValue: number
}

export interface TokenPlanSeat {
  instanceCode: string
  seatId: string
  specType: string
  status: string
  assignedStatus: string
  accountId?: string
  accountName?: string
  accountEmail?: string
  startTime: number
  endTime: number
  equityList: EquityQuota[]
}

export interface TokenPlanSharedPackage {
  instanceCode: string
  status: string
  equityList: EquityQuota[]
}

interface TokenPlanPage<T> {
  items: T[]
  total: number
}

function toEquityList(value: unknown): EquityQuota[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(
      (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object',
    )
    .map((entry) => ({
      equityType: typeof entry.EquityType === 'string' ? entry.EquityType : '',
      cycleStartTime: Number(entry.CycleStartTime ?? 0),
      cycleEndTime: Number(entry.CycleEndTime ?? 0),
      cycleTotalValue: Number(entry.CycleTotalValue ?? 0),
      cycleSurplusValue: Number(entry.CycleSurplusValue ?? 0),
    }))
}

function toSeat(entry: Record<string, unknown>): TokenPlanSeat {
  return {
    instanceCode: typeof entry.InstanceCode === 'string' ? entry.InstanceCode : '',
    seatId: typeof entry.SeatId === 'string' ? entry.SeatId : '',
    specType: typeof entry.SpecType === 'string' ? entry.SpecType : '',
    status: typeof entry.Status === 'string' ? entry.Status : '',
    assignedStatus: typeof entry.AssignedStatus === 'string' ? entry.AssignedStatus : '',
    accountId: typeof entry.AccountId === 'string' ? entry.AccountId : undefined,
    accountName: typeof entry.AccountName === 'string' ? entry.AccountName : undefined,
    accountEmail: typeof entry.AccountEmail === 'string' ? entry.AccountEmail : undefined,
    startTime: Number(entry.StartTime ?? 0),
    endTime: Number(entry.EndTime ?? 0),
    equityList: toEquityList(entry.EquityList),
  }
}

function toSharedPackage(entry: Record<string, unknown>): TokenPlanSharedPackage {
  return {
    instanceCode: typeof entry.InstanceCode === 'string' ? entry.InstanceCode : '',
    status: typeof entry.Status === 'string' ? entry.Status : '',
    equityList: toEquityList(entry.EquityList),
  }
}

function pageOf<T>(data: unknown, mapper: (entry: Record<string, unknown>) => T): TokenPlanPage<T> {
  const body = data as { Items?: unknown[]; Total?: number } | null
  const items = Array.isArray(body?.Items)
    ? body.Items.filter(
        (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object',
      ).map(mapper)
    : []
  return { items, total: Number(body?.Total ?? items.length) }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function getTokenPlanAccount(creds: AliyunCredentials): Promise<TokenPlanAccount> {
  const response = await tokenPlanGet(creds, 'GetTokenPlanAccountDetail', '/tokenplan/account')
  const data = response.Data as Record<string, unknown> | null

  const memberships = Array.isArray(data?.OrgMemberships)
    ? data.OrgMemberships.filter(
        (m): m is Record<string, unknown> => m !== null && typeof m === 'object',
      )
    : []
  const orgs: TokenPlanOrg[] = memberships.map((membership) => {
    const workspaces = Array.isArray(membership.Workspaces)
      ? membership.Workspaces.filter(
          (w): w is Record<string, unknown> => w !== null && typeof w === 'object',
        ).map((w) => ({
          workspaceId: typeof w.WorkspaceId === 'string' ? w.WorkspaceId : '',
          roleCode: typeof w.RoleCode === 'string' ? w.RoleCode : '',
        }))
      : []
    return {
      orgId: typeof membership.OrgId === 'string' ? membership.OrgId : '',
      roleCode: typeof membership.RoleCode === 'string' ? membership.RoleCode : '',
      workspaces,
    }
  })

  return {
    accountId: typeof data?.AccountId === 'string' ? data.AccountId : '',
    aliyunUid: typeof data?.AliyunUid === 'string' ? data.AliyunUid : '',
    name: typeof data?.Name === 'string' ? data.Name : '',
    accountType: typeof data?.AccountType === 'string' ? data.AccountType : '',
    orgs,
  }
}

export async function getTokenPlanSeats(
  creds: AliyunCredentials,
  opts?: { pageNo?: number; pageSize?: number },
): Promise<TokenPlanPage<TokenPlanSeat>> {
  const response = await tokenPlanGet(
    creds,
    'GetSubscriptionSeatDetails',
    '/tokenplan/subscription/seat-detail',
    {
      PageNo: String(opts?.pageNo ?? 1),
      PageSize: String(opts?.pageSize ?? 20),
    },
  )
  return pageOf(response.Data, toSeat)
}

export async function getTokenPlanSharedPackages(
  creds: AliyunCredentials,
  opts?: { pageNo?: number; pageSize?: number },
): Promise<TokenPlanPage<TokenPlanSharedPackage>> {
  const response = await tokenPlanGet(
    creds,
    'ListSubscriptionSharedPackages',
    '/tokenplan/subscription/shared-packages',
    {
      PageNo: String(opts?.pageNo ?? 1),
      PageSize: String(opts?.pageSize ?? 20),
    },
  )
  return pageOf(response.Data, toSharedPackage)
}

export interface TokenPlanStats {
  raw: unknown
}

export async function getTokenPlanStats(
  creds: AliyunCredentials,
  orgId?: string,
): Promise<TokenPlanStats> {
  const response = await tokenPlanGet(
    creds,
    'GetSubscriptionStats',
    '/tokenplan/subscription/stats',
    orgId ? { OrgId: orgId } : undefined,
  )
  return { raw: response.Data }
}
