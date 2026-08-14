import { signVolcRequest } from './sign.ts'

const textEncoder = new TextEncoder()

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Volcengine Ark control-plane clients.
 *
 * - GetAFPUsage (Agent Plan AFP quota):     https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2479847
 * - GetUsageDetails (Agent Plan usage):     https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2479849
 * - GetInferenceUsage (Coding Plan usage):  https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2116766
 * - Base URL & auth:                        https://console.volcengine.com/ark/region:cn-beijing/docs/82379/1298459
 *
 * All are control-plane APIs authenticated with Access Key ID + Secret Access Key
 * (HMAC-SHA256 signature v4, service = ark, region = cn-beijing).
 */

export const ARK_API_VERSION = '2024-01-01'
// 管控面 API 网关（文档 1298459 Base URL）；GetAFPUsage/GetUsageDetails 文档示例中的
// ark.cn-beijing.volces.com 是数据面网关，不接受 AK/SK 签名鉴权。
export const ARK_PLAN_HOST = 'ark.cn-beijing.volcengineapi.com'
export const ARK_OPEN_HOST = 'open.volcengineapi.com'

export interface VolcCredentials {
  accessKey: string
  secretKey: string
}

export class VolcApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

interface ArkResponse {
  Result?: unknown
  ResponseMetadata?: {
    RequestId?: string
    Error?: { Code?: string; Message?: string }
  }
}

async function arkCall(
  creds: VolcCredentials,
  host: string,
  action: string,
  body: unknown,
  region?: string,
): Promise<ArkResponse> {
  const bodyText = JSON.stringify(body)
  const payloadHash = await sha256Hex(bodyText)

  const query: Record<string, string> = { Action: action, Version: ARK_API_VERSION }
  if (region) {
    query.Region = region
  }

  const { headers } = await signVolcRequest({
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    method: 'POST',
    host,
    query,
    body: bodyText,
    region: 'cn-beijing',
    service: 'ark',
    extraHeaders: { 'x-content-sha256': payloadHash },
  })

  let res: Response
  try {
    const queryString = Object.entries(query)
      .map(([key, value]) => `${key}=${value}`)
      .join('&')
    res = await fetch(`https://${host}/?${queryString}`, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json; charset=UTF-8',
      },
      body: bodyText,
    })
  } catch (cause) {
    throw new VolcApiError(0, 'NetworkError', `请求火山方舟失败: ${String(cause)}`)
  }

  const text = await res.text()
  let json: ArkResponse
  try {
    json = JSON.parse(text) as ArkResponse
  } catch {
    throw new VolcApiError(
      res.status,
      'InvalidResponse',
      `响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok || json.ResponseMetadata?.Error) {
    const metaError = json.ResponseMetadata?.Error
    let gatewayCode: string | undefined
    let gatewayMessage: string | undefined
    if ('error' in json && json.error && typeof json.error === 'object') {
      const error = json.error
      if ('code' in error && typeof error.code === 'string') {
        gatewayCode = error.code
      }
      if ('message' in error && typeof error.message === 'string') {
        gatewayMessage = error.message
      }
    }
    const code = metaError?.Code ?? gatewayCode ?? `HTTP_${res.status}`
    const message = metaError?.Message ?? gatewayMessage ?? text.slice(0, 200)
    throw new VolcApiError(res.status, code, message)
  }
  return json
}

// ---------------------------------------------------------------------------
// GetAFPUsage - Agent Plan 五小时/每日/每周/每月 AFP 额度
// ---------------------------------------------------------------------------

export type PlanWindowName = 'fiveHour' | 'daily' | 'weekly' | 'monthly'

export interface PlanWindow {
  window: PlanWindowName
  quota: number
  used: number
  subscribeTime: number
  resetTime: number
}

interface AfpWindowShape {
  Quota?: number
  Used?: number
  SubscribeTime?: number
  ResetTime?: number
}

export interface AfpUsage {
  planType?: string
  windows: PlanWindow[]
}

function toWindow(window: PlanWindowName, shape: AfpWindowShape | undefined): PlanWindow {
  return {
    window,
    quota: Number(shape?.Quota ?? 0),
    used: Number(shape?.Used ?? 0),
    subscribeTime: Number(shape?.SubscribeTime ?? 0),
    resetTime: Number(shape?.ResetTime ?? 0),
  }
}

export async function getAfpUsage(creds: VolcCredentials): Promise<AfpUsage> {
  const response = await arkCall(creds, ARK_PLAN_HOST, 'GetAFPUsage', {})
  const result = response.Result as {
    PlanType?: string
    AFPFiveHour?: AfpWindowShape
    AFPDaily?: AfpWindowShape
    AFPWeekly?: AfpWindowShape
    AFPMonthly?: AfpWindowShape
  } | null

  return {
    planType: result?.PlanType,
    windows: [
      toWindow('fiveHour', result?.AFPFiveHour),
      toWindow('daily', result?.AFPDaily),
      toWindow('weekly', result?.AFPWeekly),
      toWindow('monthly', result?.AFPMonthly),
    ],
  }
}

// ---------------------------------------------------------------------------
// GetUsageDetails - Agent Plan 模型调用明细
// ---------------------------------------------------------------------------

export type BillingType = 'WithinPlan' | 'OutsideOfPlan'

export interface UsageDetail {
  time: number
  objectName: string
  usage: number
  unit: string
  billingType: BillingType
}

export async function getUsageDetails(
  creds: VolcCredentials,
  startDate: string,
  endDate: string,
): Promise<UsageDetail[]> {
  const response = await arkCall(creds, ARK_PLAN_HOST, 'GetUsageDetails', {
    QueryInterval: 'Day',
    Filter: {
      StartTime: startDate,
      EndTime: endDate,
    },
  })
  const details =
    (response.Result as { Details?: Array<Record<string, unknown>> } | null)?.Details ?? []

  return details.map((entry) => {
    const objectName = typeof entry.ObjectName === 'string' ? entry.ObjectName : ''
    const unit = typeof entry.Unit === 'string' ? entry.Unit : 'Tokens'
    return {
      time: Number(entry.Time ?? 0),
      objectName,
      usage: Number(entry.Usage ?? 0),
      unit,
      billingType: (entry.BillingType === 'OutsideOfPlan'
        ? 'OutsideOfPlan'
        : 'WithinPlan') as BillingType,
    }
  })
}

// ---------------------------------------------------------------------------
// GetCodingPlanUsage - Coding Plan 套餐额度（session/每周/每月窗口）
// ---------------------------------------------------------------------------

export interface CodingPlanWindow {
  level: string
  percent: number
  resetTime: number
}

export interface CodingPlanUsage {
  status: string
  updateTimestamp: number
  windows: CodingPlanWindow[]
}

/**
 * Coding Plan 额度查询（实现参考开源项目 cc-switch 的 src-tauri/services/coding_plan.rs）：
 * - POST open.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01&Region=cn-beijing
 * - 响应 Result.QuotaUsage[]（或 Usages/Details）：Level(session/weekly/monthly) + Percent + ResetTime(秒)
 * - 已用真实凭据实测：200 返回 { Status: "Reclaimed", UpdateTimestamp } 表示订阅已回收
 */
export async function getCodingPlanUsage(creds: VolcCredentials): Promise<CodingPlanUsage> {
  const response = await arkCall(creds, ARK_OPEN_HOST, 'GetCodingPlanUsage', {}, 'cn-beijing')
  const result = response.Result as Record<string, unknown> | null

  const windows: CodingPlanWindow[] = []
  const quotaUsage =
    (Array.isArray(result?.QuotaUsage) ? result.QuotaUsage : undefined) ??
    (Array.isArray(result?.Usages) ? result.Usages : undefined) ??
    (Array.isArray(result?.Details) ? result.Details : undefined)
  if (quotaUsage) {
    for (const item of quotaUsage) {
      if (item === null || typeof item !== 'object') {
        continue
      }
      const entry = item as Record<string, unknown>
      const level =
        (typeof entry.Level === 'string' ? entry.Level : '') ||
        (typeof entry.Type === 'string' ? entry.Type : '') ||
        (typeof entry.Period === 'string' ? entry.Period : '')
      if (!level) {
        continue
      }
      const percent = Number(entry.Percent ?? entry.UsedPercent ?? entry.UsagePercent ?? 0)
      const rawReset = entry.ResetTime ?? entry.ResetTimestamp
      const resetTime = Number(rawReset ?? 0)
      windows.push({ level, percent, resetTime: resetTime > 1e12 ? resetTime : resetTime * 1000 })
    }
  }

  return {
    status: typeof result?.Status === 'string' ? result.Status : '',
    updateTimestamp: Number(result?.UpdateTimestamp ?? 0),
    windows,
  }
}

// ---------------------------------------------------------------------------
// GetInferenceUsage - 推理用量（Coding Plan 查询用量）
// ---------------------------------------------------------------------------

export interface InferenceRow {
  day: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
  imageCount: number
  model?: string
  modelEndpoint?: string
}

export interface InferenceUsage {
  rows: InferenceRow[]
  columns: string[]
}

export async function getInferenceUsage(
  creds: VolcCredentials,
  startDate: string,
  endDate: string,
  filters?: Array<{ key: string; values: string[] }>,
): Promise<InferenceUsage> {
  const response = await arkCall(creds, ARK_OPEN_HOST, 'GetInferenceUsage', {
    QueryInterval: 'Day',
    StartTime: startDate,
    EndTime: endDate,
    ...(filters && filters.length > 0 ? { Filters: filters } : {}),
  })
  const result = response.Result as {
    Fields?: Array<{ Name?: string }>
    Data?: string[][]
  } | null

  const fields = (result?.Fields ?? []).map((field) => field.Name ?? '')
  const indexOf = (name: string) => fields.indexOf(name)
  const numberAt = (row: string[], name: string) => {
    const index = indexOf(name)
    return index >= 0 ? Number(row[index] ?? 0) : 0
  }
  const stringAt = (row: string[], name: string): string | undefined => {
    const index = indexOf(name)
    return index >= 0 ? (row[index] ?? undefined) : undefined
  }

  const rows: InferenceRow[] = (result?.Data ?? []).map((row) => ({
    day: stringAt(row, 'Day') ?? '',
    inputTokens: numberAt(row, 'InputTokens'),
    outputTokens: numberAt(row, 'OutputTokens'),
    totalTokens: numberAt(row, 'TotalTokens'),
    requests: numberAt(row, 'ReqCnt'),
    imageCount: numberAt(row, 'ImageCount'),
    model: stringAt(row, 'ModelName'),
    modelEndpoint: stringAt(row, 'ModelEndpoint'),
  }))

  return { rows, columns: fields }
}
