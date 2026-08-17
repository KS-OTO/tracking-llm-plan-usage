export interface ProviderStatus {
  configured: boolean
  count: number
  keyHints: string[]
}

export interface StatusResponse {
  providers: {
    deepseek: ProviderStatus
    volc: ProviderStatus
    zhipu: ProviderStatus
    aliyun: ProviderStatus
    gitee: ProviderStatus
  }
  now: number
}

/** 多账号响应包裹：成功账号携带数据字段，失败账号仅含错误信息（服务端 runAccounts 契约）。 */
export type AccountEnvelope<T> = (T & { keyHint: string }) | { keyHint: string; error: string }

/** 账号查询是否失败（失败账号不含数据字段）。 */
export function isFailedAccount<T>(
  account: AccountEnvelope<T>,
): account is { keyHint: string; error: string } {
  return 'error' in account && account.error !== undefined
}

export interface BalanceEntry {
  currency: string
  total: number
  granted: number
  toppedUp: number
}

export interface DeepSeekBalance {
  isAvailable: boolean
  balances: BalanceEntry[]
}

export interface DeepSeekBalanceResponse {
  accounts: AccountEnvelope<DeepSeekBalance>[]
}

export type PlanWindowName = 'fiveHour' | 'daily' | 'weekly' | 'monthly'

export interface PlanWindow {
  window: PlanWindowName
  quota: number
  used: number
  subscribeTime: number
  resetTime: number
}

export type BillingType = 'WithinPlan' | 'OutsideOfPlan'

export interface UsageDetail {
  time: number
  objectName: string
  usage: number
  unit: string
  billingType: BillingType
}

export interface VolcPlanData {
  planType?: string
  windows: PlanWindow[]
  details: UsageDetail[]
  detailsStart: string
  detailsEnd: string
  codingPlan: {
    status: string
    updateTimestamp: number
    windows: Array<{
      level: string
      percent: number
      resetTime: number
    }>
  }
}

export interface VolcPlanResponse {
  accounts: AccountEnvelope<VolcPlanData>[]
}

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

export interface InferenceUsageData {
  rows: InferenceRow[]
  start: string
  end: string
}

export interface InferenceUsageResponse {
  accounts: AccountEnvelope<InferenceUsageData>[]
}

export interface ZhipuQuotaWindow {
  window: 'fiveHour' | 'weekly'
  total: number
  used: number
  remaining: number
  percentage: number
  nextResetTime: number
}

export interface ZhipuCodingPlanQuota {
  level: string
  windows: ZhipuQuotaWindow[]
}

export interface ZhipuAccountBalance {
  balance: number
  availableBalance: number
  rechargeAmount: number
  giveAmount: number
  creditStatus: string
}

export interface ZhipuTokenPackage {
  id: number
  resourcePackageName: string
  tokensMagnitude: number
  tokenBalance: number
  availableBalance: number
  consumeType: string
  status: string
  type: string
  suitableScene: string
  effectiveTime: string
  packageExpirationTime: string
}

export interface ZhipuPackagesData {
  codingPlan: ZhipuCodingPlanQuota
  balance: ZhipuAccountBalance
  packages: ZhipuTokenPackage[]
}

export interface ZhipuPackagesResponse {
  accounts: AccountEnvelope<ZhipuPackagesData>[]
}

export interface AliyunResourcePackage {
  instanceId: string
  commodityCode: string
  packageType: string
  region: string
  status: string
  effectiveTime: string
  expiryTime: string
  totalAmount: string
  totalAmountUnit: string
  remainingAmount: string
  remainingAmountUnit: string
  remark: string
  applicableProducts: string[]
}

export interface AliyunPackagesResponse {
  accounts: AccountEnvelope<{ packages: AliyunResourcePackage[]; totalCount: number }>[]
}

export interface TokenPlanEquity {
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
  equityList: TokenPlanEquity[]
}

export interface TokenPlanSharedPackage {
  instanceCode: string
  status: string
  equityList: TokenPlanEquity[]
}

export interface TokenPlanAccount {
  accountId: string
  aliyunUid: string
  name: string
  accountType: string
  orgs: Array<{
    orgId: string
    roleCode: string
    workspaces: Array<{ workspaceId: string; roleCode: string }>
  }>
}

export interface TokenPlanData {
  account: TokenPlanAccount
  seats: { items: TokenPlanSeat[]; total: number }
  sharedPackages: { items: TokenPlanSharedPackage[]; total: number }
}

export interface TokenPlanResponse {
  accounts: AccountEnvelope<TokenPlanData>[]
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
  /** 配置了 GITEE_AI_SESSION_COOKIE 时返回的代金券数据（独立容错）。 */
  voucher?: GiteeVoucherSlice
}

export interface GiteeVoucherCoupon {
  id: number
  catalog: string
  type: string
  amount: number
  balance: number
  expiredAt: number
  status: number
  serviceTypes: string[]
}

export interface GiteeVoucher {
  namespace: string
  couponCashBalance: number
  couponComputeBalance: number
  coupons: GiteeVoucherCoupon[]
}

/** 代金券子查询（独立容错）：成功携带 data，失败仅含 error（判别联合，二者互斥）。 */
export type GiteeVoucherSlice = { data: GiteeVoucher } | { error: string }

export interface GiteeBalanceResponse {
  accounts: AccountEnvelope<GiteePackageBalance>[]
}

export interface ExtrasBalance {
  provider: string
  balance: number
  total?: number
  used?: number
  unit: string
  note?: string
  error?: string
}

export interface ExtrasPlanWindow {
  window: 'fiveHour' | 'weekly'
  percent: number
  resetTime: number
}

export interface ExtrasPlan {
  provider: string
  windows: ExtrasPlanWindow[]
  error?: string
}

export interface ExtrasBalanceGroup {
  provider: string
  accounts: AccountEnvelope<ExtrasBalance>[]
}

export interface ExtrasPlanGroup {
  provider: string
  accounts: AccountEnvelope<ExtrasPlan>[]
}

export interface ExtrasResponse {
  balances: ExtrasBalanceGroup[]
  plans: ExtrasPlanGroup[]
  configured: number
}

export interface ApiErrorPayload {
  error?: {
    code: string
    message: string
  }
}
