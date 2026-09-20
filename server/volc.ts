/**
 * Volcengine Ark control-plane clients.
 *
 * - GetPersonalPlan / GetAFPUsage / GetUsageDetails / GetCodingPlanUsage / GetInferenceUsage
 * - 签名走 sign.ts（火山 v4，Web Crypto）
 * - 响应结构经 zod schema 在边界统一解析
 *
 * 官方文档（Agent Plan 管控面，均只支持 Access Key 鉴权）：
 * - 查询个人版套餐   https://console.volcengine.com/ark/region:cn-beijing/docs/ark/get-personal-plan-api
 * - 获取套餐 AFP 额度 https://console.volcengine.com/ark/region:cn-beijing/docs/ark/get-afp-usage-api
 * - 获取套餐用量详情 https://console.volcengine.com/ark/region:cn-beijing/docs/ark/get-usage-details-api
 * - 套餐额度口径说明 https://www.volcengine.com/docs/82379/2366394
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
// GetPersonalPlan - 个人版套餐（档位 / 状态 / 生效与到期 / 自动续费）
// ---------------------------------------------------------------------------

export type PersonalPlanName = 'AgentPlan' | 'CodingPlan'

export interface PersonalPlan {
  planType: string
  status: string
  startTime: string
  endTime: string
  autoRenew: boolean
}

/**
 * 未订阅 / 已回收 —— 这是「没有这个套餐」，**不是故障**。
 *
 * 文档明确：未购买或套餐已回收时返回该错误码。因此它必须转成 `null`，
 * 否则「没买 Coding Plan」会被渲染成一张红色错误卡。
 */
export const PLAN_NOT_FOUND_CODE = 'ResourceNotFound.Plan'

const PersonalPlanResult = z
  .object({
    PlanType: z.string().catch(''),
    Status: z.string().catch(''),
    StartTime: z.string().catch(''),
    EndTime: z.string().catch(''),
    // 不能写 z.coerce.boolean()：字符串 'false' 会被强制转成 true。
    AutoRenew: z.boolean().catch(false),
  })
  .nullable()
  .catch(null)

/**
 * `Plan` 只接受 `AgentPlan` / `CodingPlan`（乱填 → 400 `InvalidParameter.Plan`）。
 * 实测 `{ "Plan": "CodingPlan" }` 在只有 Agent Plan 的账号上返回 404 `ResourceNotFound.Plan`。
 */
export async function getPersonalPlan(
  creds: VolcCredentials,
  plan: PersonalPlanName,
): Promise<PersonalPlan | null> {
  let response: z.infer<typeof ArkResponse>
  try {
    response = await arkCall(creds, ARK_PLAN_HOST, 'GetPersonalPlan', { Plan: plan })
  } catch (error) {
    if (error instanceof VolcApiError && error.code === PLAN_NOT_FOUND_CODE) {
      return null
    }
    throw error
  }
  const parsed = PersonalPlanResult.safeParse(response.Result)
  if (!parsed.success) {
    warnSchemaFallback('GetPersonalPlan', response.Result)
    return null
  }
  const result = parsed.data
  // 档位与状态都取不到 → 当作「没有套餐」，而不是渲染一整行「—」：
  // zod 的 object 会静默丢掉未知键，所以「结构漂移」和「空响应」到这里是同一个形状。
  if (!result || (!result.PlanType && !result.Status)) {
    return null
  }
  return {
    planType: result.PlanType,
    status: result.Status,
    startTime: result.StartTime,
    endTime: result.EndTime,
    autoRenew: result.AutoRenew,
  }
}

// ---------------------------------------------------------------------------
// GetAFPUsage - Agent Plan 五小时/日/周/月 AFP 额度
// ---------------------------------------------------------------------------

/**
 * 单位是 AFP，时间戳是 epoch 毫秒。
 *
 * **四个窗口不是同一套限额**（文档 82379/2366394「用量说明」）：
 *
 * - 文本生成、向量化模型 → 受「5 小时 / 周 / 月」三个限额约束；
 * - 图片生成、视频生成、语音模型、Harness → **没有 5 小时与周限额**，
 *   只受「模型日额度」与月限额约束。
 *
 * 所以 `AFPDaily` 是**模型日额度**（每日 00:00 重置，**仅上述非文本模型计入**），
 * 只跑文本模型时它恒为 `Used: 0`。这是预期行为 —— 既不是「每日限额已被取消」，
 * 也不是接口故障。实测已对上：日额度 = 月额度 ÷ 2（Medium 50,000 = 100,000 / 2），
 * 而 5 小时窗口已用到 9,995.69 / 10,000 时 `AFPDaily.Used` 仍是 0
 * （5 小时窗口完全落在日窗口区间内，两个计数来自不同模型集合，因此并不矛盾）。
 */
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
  // 格式串必须是**字面量**：`label` 若含 `%s` 之类的占位符，写进模板字符串后会被
  // console 当成格式串解析、把 `value` 顶掉（semgrep: unsafe-formatstring）。
  console.warn('[volc] %s 响应契约漂移，已降级解析（原始值见日志）', label, value)
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

/**
 * 实测契约（2026-09-20，真实凭据 + API 反推）：
 *
 * - `QueryInterval` 与 `Filter` 都是**必选**：少任一个直接 400
 *   （`MissingParameter.QueryInterval` / `MissingParameter.Filter`）。
 * - `Filter.StartTime` / `Filter.EndTime` 是**真过滤**（传单日只回单日）。
 * - `Filter` **没有 `ObjectName` 字段** —— 传了报 400 `InvalidParameter.Filter.ObjectName`。
 *   所以「按模型过滤」只能在客户端做（Section 的模型输入框就是这么做的）。
 * - **区间上限 31 天**：超了 400 `InvalidParameter.StartTime/EndTime: date range must not exceed 31 days`
 *   （实测 32 天可过、90 天 400）。调用方必须自己收口，见 `app.ts` 的 `VOLC_MAX_RANGE_DAYS`。
 * - `QueryInterval: 'Hour'` 可用，此时 `Time` 落在整点小时桶上。
 */
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

/**
 * 实测契约（2026-09-20）：
 *
 * - `QueryInterval` 必选；**区间上限 31 天**（90 天 → 400 `InvalidParameter.TimeRange:
 *   time range must be less than 31 days`；32 天可过）。
 * - `Fields` 是**动态列**：`ModelName` 只在带了 `Filters: [{key:'ModelName', …}]` 时出现，
 *   不带过滤时压根没有这一列（所以未过滤视图下 `model` 恒为 `undefined`，属正常）。
 *   `ModelEndpoint` 即便按 ModelName 过滤也不出现。
 * - `Filters` 的 key **乱填会 500 `InternalError`**（不是 400）—— 过滤值由用户输入驱动时
 *   要留意这一点。
 * - 未被建模的列：`CacheTokensHit`（缓存命中 token）、`InputImageCount`、`Hour`。
 */
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
