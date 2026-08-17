/**
 * Volcengine Ark control-plane clients.
 *
 * - GetAFPUsage / GetUsageDetails / GetCodingPlanUsage / GetInferenceUsage
 * - 签名走 sign.ts（火山 v4，Web Crypto）
 * - 响应结构经 zod schema 在边界统一解析
 */
import { z } from 'zod'

import { signVolcRequest } from './sign.ts'

const textEncoder = new TextEncoder()

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

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

const ArkResponse = z.object({
  ResponseMetadata: z
    .object({
      Error: z.object({ Code: z.string().optional(), Message: z.string().optional() }).optional(),
    })
    .optional(),
  Result: z.unknown().optional(),
  error: z.unknown().optional(),
})

async function arkCall(
  creds: VolcCredentials,
  host: string,
  action: string,
  body: unknown,
  region?: string,
): Promise<z.infer<typeof ArkResponse>> {
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
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new VolcApiError(
      res.status,
      'InvalidResponse',
      `响应不是合法 JSON: ${text.slice(0, 200)}`,
    )
  }
  const parsed = ArkResponse.safeParse(json)
  if (!parsed.success) {
    throw new VolcApiError(res.status, 'InvalidResponse', `响应结构无法解析: ${text.slice(0, 200)}`)
  }

  const result = parsed.data
  if (!res.ok || result.ResponseMetadata?.Error) {
    const metaError = result.ResponseMetadata?.Error
    const gatewayError = ArkGatewayError.safeParse(result.error)
    const code = metaError?.Code ?? gatewayError.data?.code ?? `HTTP_${res.status}`
    const message = metaError?.Message ?? gatewayError.data?.message ?? text.slice(0, 200)
    throw new VolcApiError(res.status, code, message)
  }
  return result
}

const ArkGatewayError = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
})

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

const AfpWindowShape = z
  .object({
    Quota: z.coerce.number().catch(0),
    Used: z.coerce.number().catch(0),
    SubscribeTime: z.coerce.number().catch(0),
    ResetTime: z.coerce.number().catch(0),
  })
  .nullish()

function warnSchemaFallback(label: string, value: unknown): void {
  console.warn(`[volc] ${label} 响应契约漂移，已降级解析（原始值见日志）`, value)
}

const AfpResult = z
  .object({
    PlanType: z.string().optional(),
    AFPFiveHour: AfpWindowShape,
    AFPDaily: AfpWindowShape,
    AFPWeekly: AfpWindowShape,
    AFPMonthly: AfpWindowShape,
  })
  .nullable()
  .catch(null)

export interface AfpUsage {
  planType?: string
  windows: PlanWindow[]
}

function toWindow(window: PlanWindowName, shape: z.infer<typeof AfpWindowShape>): PlanWindow {
  return {
    window,
    quota: shape?.Quota ?? 0,
    used: shape?.Used ?? 0,
    subscribeTime: shape?.SubscribeTime ?? 0,
    resetTime: shape?.ResetTime ?? 0,
  }
}

export async function getAfpUsage(creds: VolcCredentials): Promise<AfpUsage> {
  const response = await arkCall(creds, ARK_PLAN_HOST, 'GetAFPUsage', {})
  const parsedAfp = AfpResult.safeParse(response.Result)
  if (!parsedAfp.success) {
    warnSchemaFallback('GetAFPUsage', response.Result)
  }
  const result = parsedAfp.success ? parsedAfp.data : null

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

const UsageDetailsResult = z
  .object({
    Details: z
      .array(
        z.object({
          Time: z.coerce.number().catch(0),
          ObjectName: z.string().catch(''),
          Usage: z.coerce.number().catch(0),
          Unit: z.string().catch('Tokens'),
          BillingType: z.string().catch('WithinPlan'),
        }),
      )
      .catch([]),
  })
  .nullable()
  .catch(null)

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
  const parsedDetails = UsageDetailsResult.safeParse(response.Result)
  if (!parsedDetails.success) {
    warnSchemaFallback('GetUsageDetails', response.Result)
  }
  const details = parsedDetails.success ? (parsedDetails.data?.Details ?? []) : []

  return details.map((entry) => ({
    time: entry.Time,
    objectName: entry.ObjectName,
    usage: entry.Usage,
    unit: entry.Unit,
    billingType: entry.BillingType === 'OutsideOfPlan' ? 'OutsideOfPlan' : 'WithinPlan',
  }))
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

const CodingPlanQuotaItem = z
  .object({
    Level: z.string().catch(''),
    Type: z.string().catch(''),
    Period: z.string().catch(''),
    Percent: z.coerce.number().nullish(),
    UsedPercent: z.coerce.number().nullish(),
    UsagePercent: z.coerce.number().nullish(),
    ResetTime: z.coerce.number().nullish(),
    ResetTimestamp: z.coerce.number().nullish(),
  })
  .nullish()

const CodingPlanResult = z
  .object({
    QuotaUsage: z.array(CodingPlanQuotaItem).nullish().catch(null),
    Usages: z.array(CodingPlanQuotaItem).nullish().catch(null),
    Details: z.array(CodingPlanQuotaItem).nullish().catch(null),
    Status: z.string().catch(''),
    UpdateTimestamp: z.coerce.number().catch(0),
  })
  .nullable()
  .catch(null)

/**
 * Coding Plan 额度查询（实现参考开源项目 cc-switch 的 src-tauri/services/coding_plan.rs）：
 * - POST open.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01&Region=cn-beijing
 * - 响应 Result.QuotaUsage[]（或 Usages/Details）：Level(session/weekly/monthly) + Percent + ResetTime(秒)
 * - 已用真实凭据实测：200 返回 { Status: "Reclaimed", UpdateTimestamp } 表示订阅已回收
 */
export async function getCodingPlanUsage(creds: VolcCredentials): Promise<CodingPlanUsage> {
  const response = await arkCall(creds, ARK_OPEN_HOST, 'GetCodingPlanUsage', {}, 'cn-beijing')
  const parsedCoding = CodingPlanResult.safeParse(response.Result)
  if (!parsedCoding.success) {
    warnSchemaFallback('GetCodingPlanUsage', response.Result)
  }
  const result = parsedCoding.success ? parsedCoding.data : null

  const windows: CodingPlanWindow[] = []
  const quotaUsage = result?.QuotaUsage ?? result?.Usages ?? result?.Details
  if (quotaUsage) {
    for (const raw of quotaUsage) {
      if (!raw) {
        continue
      }
      const entry = raw
      const level = entry.Level || entry.Type || entry.Period
      if (!level) {
        continue
      }
      const percent = entry.Percent ?? entry.UsedPercent ?? entry.UsagePercent ?? 0
      const resetTime = entry.ResetTime ?? entry.ResetTimestamp ?? 0
      windows.push({ level, percent, resetTime: resetTime > 1e12 ? resetTime : resetTime * 1000 })
    }
  }

  return {
    status: result?.Status ?? '',
    updateTimestamp: result?.UpdateTimestamp ?? 0,
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

const InferenceResult = z
  .object({
    Fields: z.array(z.object({ Name: z.string().catch('') })).catch([]),
    Data: z.array(z.array(z.union([z.string(), z.number(), z.null()]).catch(''))).catch([]),
  })
  .nullable()
  .catch(null)

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
  const parsedInference = InferenceResult.safeParse(response.Result)
  if (!parsedInference.success) {
    warnSchemaFallback('GetInferenceUsage', response.Result)
  }
  const result = parsedInference.success ? parsedInference.data : null

  const fields = (result?.Fields ?? []).map((field) => field.Name)
  const indexOf = (name: string) => fields.indexOf(name)
  const numberAt = (row: Array<string | number | null>, name: string) => {
    const index = indexOf(name)
    return index >= 0 ? Number(row[index] ?? 0) : 0
  }

  const stringAt = (row: Array<string | number | null>, name: string): string | undefined => {
    const index = indexOf(name)
    if (index < 0 || row[index] === null) {
      return undefined
    }
    return String(row[index])
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
