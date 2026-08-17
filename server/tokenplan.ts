import { z } from 'zod'

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

const TokenPlanEnvelope = z.object({
  Success: z.boolean().optional().catch(undefined),
  Code: z.string().optional(),
  Message: z.string().optional(),
  Data: z.unknown().optional(),
})

type TokenPlanResponse = z.infer<typeof TokenPlanEnvelope>

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
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new TokenPlanApiError('InvalidResponse', `响应不是合法 JSON: ${text.slice(0, 200)}`)
  }
  const parsed = TokenPlanEnvelope.safeParse(json)
  if (!parsed.success) {
    throw new TokenPlanApiError('InvalidResponse', `响应结构无法解析: ${text.slice(0, 200)}`)
  }

  if (!res.ok || parsed.data.Success === false) {
    throw new TokenPlanApiError(
      parsed.data.Code ?? `HTTP_${res.status}`,
      parsed.data.Message ?? text.slice(0, 200),
    )
  }
  return parsed.data
}

// ---------------------------------------------------------------------------
// 类型与 schema
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

const EquityQuotaShape = z.object({
  EquityType: z.string().catch(''),
  CycleStartTime: z.coerce.number().catch(0),
  CycleEndTime: z.coerce.number().catch(0),
  CycleTotalValue: z.coerce.number().catch(0),
  CycleSurplusValue: z.coerce.number().catch(0),
})

const WorkspaceShape = z.object({
  WorkspaceId: z.string().catch(''),
  RoleCode: z.string().catch(''),
})

const OrgMembershipShape = z.object({
  OrgId: z.string().catch(''),
  RoleCode: z.string().catch(''),
  Workspaces: z.array(WorkspaceShape).catch([]),
})

const AccountDetailData = z
  .object({
    AccountId: z.string().catch(''),
    AliyunUid: z.string().catch(''),
    Name: z.string().catch(''),
    AccountType: z.string().catch(''),
    OrgMemberships: z.array(OrgMembershipShape).catch([]),
  })
  .nullable()
  .catch(null)

const SeatShape = z.object({
  InstanceCode: z.string().catch(''),
  SeatId: z.string().catch(''),
  SpecType: z.string().catch(''),
  Status: z.string().catch(''),
  AssignedStatus: z.string().catch(''),
  AccountId: z.string().nullish(),
  AccountName: z.string().nullish(),
  AccountEmail: z.string().nullish(),
  StartTime: z.coerce.number().catch(0),
  EndTime: z.coerce.number().catch(0),
  EquityList: z.array(EquityQuotaShape).catch([]),
})

const SharedPackageShape = z.object({
  InstanceCode: z.string().catch(''),
  Status: z.string().catch(''),
  EquityList: z.array(EquityQuotaShape).catch([]),
})

function toEquity(entry: z.infer<typeof EquityQuotaShape>): EquityQuota {
  return {
    equityType: entry.EquityType,
    cycleStartTime: entry.CycleStartTime,
    cycleEndTime: entry.CycleEndTime,
    cycleTotalValue: entry.CycleTotalValue,
    cycleSurplusValue: entry.CycleSurplusValue,
  }
}

function pageOf<T>(data: unknown, itemSchema: z.ZodType<T>): TokenPlanPage<T> {
  const page = z
    .object({
      Items: z.array(itemSchema).catch([]),
      Total: z.coerce.number().optional().catch(undefined),
    })
    .nullable()
    .catch(null)
    .parse(data)
  const items = page?.Items ?? []
  return { items, total: page?.Total ?? items.length }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function getTokenPlanAccount(creds: AliyunCredentials): Promise<TokenPlanAccount> {
  const response = await tokenPlanGet(creds, 'GetTokenPlanAccountDetail', '/tokenplan/account')
  const data = AccountDetailData.parse(response.Data)

  return {
    accountId: data?.AccountId ?? '',
    aliyunUid: data?.AliyunUid ?? '',
    name: data?.Name ?? '',
    accountType: data?.AccountType ?? '',
    orgs: (data?.OrgMemberships ?? []).map((membership) => ({
      orgId: membership.OrgId,
      roleCode: membership.RoleCode,
      workspaces: membership.Workspaces.map((workspace) => ({
        workspaceId: workspace.WorkspaceId,
        roleCode: workspace.RoleCode,
      })),
    })),
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
  const page = pageOf(response.Data, SeatShape)
  return {
    total: page.total,
    items: page.items.map((seat) => ({
      instanceCode: seat.InstanceCode,
      seatId: seat.SeatId,
      specType: seat.SpecType,
      status: seat.Status,
      assignedStatus: seat.AssignedStatus,
      accountId: seat.AccountId ?? undefined,
      accountName: seat.AccountName ?? undefined,
      accountEmail: seat.AccountEmail ?? undefined,
      startTime: seat.StartTime,
      endTime: seat.EndTime,
      equityList: seat.EquityList.map(toEquity),
    })),
  }
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
  const page = pageOf(response.Data, SharedPackageShape)
  return {
    total: page.total,
    items: page.items.map((pkg) => ({
      instanceCode: pkg.InstanceCode,
      status: pkg.Status,
      equityList: pkg.EquityList.map(toEquity),
    })),
  }
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
