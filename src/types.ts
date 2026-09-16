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
    baidu: ProviderStatus
    tokenplan: ProviderStatus
    /** 余额类扩展平台（`/api/extras`）：服务端仍统计，页面已不再有独立 Tab。 */
    extras: ProviderStatus
    /** 套餐类扩展平台（Kimi / MiniMax / OpenCode Go），与「套餐订阅」Tab 对应。 */
    plans: ProviderStatus
    /** New API（自托管订阅网关，站点地址 + API Key 成对配置）。 */
    newapi: ProviderStatus
  }
  /** 半配置的成对凭据变量名（只配了 Key 没配 SecretKey）。 */
  incomplete?: string[]
  now: number
}

/** 多账号响应包裹：成功账号携带数据字段，失败账号仅含错误信息（服务端 runAccounts 契约）。 */
export type AccountEnvelope<T> =
  | (T & { keyHint: string; label?: string })
  | { keyHint: string; label?: string; error: string }

/** 账号查询是否失败（失败账号不含数据字段）。 */
export function isFailedAccount<T>(
  account: AccountEnvelope<T>,
): account is { keyHint: string; label?: string; error: string } {
  return 'error' in account && account.error !== undefined
}

/** 账号显示名：别名优先，无别名退化为「账号 N」（用于失败提示等需要序号的场合）。 */
export function accountName(account: { keyHint: string; label?: string }, index: number): string {
  return account.label || `账号 ${index + 1}`
}

/**
 * 账号主标题：别名优先，无别名退化为 Key 掩码。
 * Key 掩码对人而言可读性差，因此仅在缺少别名时才顶到主标题位置。
 */
export function accountTitle(account: { keyHint: string; label?: string }): string {
  return account.label || account.keyHint
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
  /** 组织信息；仅配置会话 Cookie（无 AK/SK）时为 null。 */
  account: TokenPlanAccount | null
  seats: { items: TokenPlanSeat[]; total: number } | null
  sharedPackages: { items: TokenPlanSharedPackage[]; total: number } | null
  /** 个人版套餐用量（独立容错切片）：失败仅携带 error。 */
  personal: TokenPlanPersonalSlice
}

export interface TokenPlanPersonalWindow {
  percent: number
  resetTime: number
}

export interface TokenPlanPersonalSubscription {
  instanceCode: string
  specCode: string
  status: string
  remainingDays: number
  startTime: number
  endTime: number
  autoRenewFlag: boolean
}

export interface TokenPlanPersonalAddon {
  remainingCredits: number
  totalCredits: number
  activeCount: number
}

/** 重置卡：可在有效期内提前重置额度窗口。 */
export interface TokenPlanResetCard {
  cardType: string
  effectiveAt: number
  expiresAt: number
}

export interface TokenPlanPersonalPlan {
  /** 数据来源：cookie（控制台会话 Cookie）/ cli（AK/SK 换 cliAccessToken）。 */
  source: 'cookie' | 'cli'
  /** 5 小时窗口；官方取消该窗口时为 null。 */
  fiveHour: TokenPlanPersonalWindow | null
  weekly: TokenPlanPersonalWindow
  subscription: TokenPlanPersonalSubscription | null
  addon: TokenPlanPersonalAddon | null
  resetCards: TokenPlanResetCard[]
}

/** 个人版用量子查询（独立容错）：成功携带 data，失败仅含 error（判别联合，二者互斥）。 */
export type TokenPlanPersonalSlice = { data: TokenPlanPersonalPlan } | { error: string }

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

export interface ExtrasPlanWindow {
  window: 'fiveHour' | 'weekly' | 'monthly'
  percent: number
  resetTime: number
  /** 上游窗口状态（如 OpenCode Go 的 `rate-limited`）；缺省表示正常或不适用。 */
  status?: string
}

export interface ExtrasPlan {
  provider: string
  windows: ExtrasPlanWindow[]
  error?: string
}

export interface ExtrasPlanGroup {
  provider: string
  accounts: AccountEnvelope<ExtrasPlan>[]
}

/**
 * 套餐类扩展平台（套餐订阅 Tab）的窗口用量。
 *
 * 余额类平台（StepFun / SiliconFlow / OpenRouter / Novita，服务端 `/api/extras`）已不再
 * 有独立 Tab：OpenRouter 有自己的区块与接口（`/api/openrouter/detail`），其余三家未接入页面。
 */
export interface PlansResponse {
  plans: ExtrasPlanGroup[]
  configured: number
}

export interface ApiErrorPayload {
  error?: {
    code: string
    message: string
  }
}

export interface QianfanPackage {
  packageId: string
  serviceName: string
  specification: string
  used: string
  status: string
  startTime: string
  expiredTime: string
  creator: string
}

export interface QianfanTpmQuota {
  instanceId: string
  model: string
  tpm: number
  status: string
  paymentTiming: string
}

export interface QianfanUsageSummary {
  serviceCount: number
  totalTokens: number
  totalCalls: number
}

export interface QianfanData {
  packages: QianfanPackage[]
  tpmQuotas: QianfanTpmQuota[]
  usage: QianfanUsageSummary
}

export interface BaiduQianfanResponse {
  accounts: AccountEnvelope<QianfanData>[]
}

export interface OpenRouterDetailData {
  provider: string
  balance: number
  total?: number
  used?: number
  unit: string
  note?: string
  isFreeTier: boolean
  isManagementKey: boolean
  label: string
  limit: number | null
  limitRemaining: number | null
  limitReset: string | null
  expiresAt: string | null
  usageDaily: number
  usageWeekly: number
  usageMonthly: number
}

export interface OpenRouterDetailResponse {
  accounts: AccountEnvelope<OpenRouterDetailData>[]
}

/** New API 按模型的区间用量（30 天聚合，已在服务端折算为额度单位）。 */
export interface NewApiModelUsage {
  model: string
  quota: number
  requests: number
  tokens: number
}

/** 订阅额度窗口（周期制）：每个周期重置，与「钱包余额只减不重置」是两回事。 */
export interface NewApiSubscription {
  status: string
  planId: number | null
  total: number | null
  used: number
  remain: number | null
  /** 已用百分比（0–100）。 */
  percent: number
  /** 周期起点（毫秒）。 */
  lastResetAt: number | null
  /** 周期重置时间（毫秒），即「下次刷新额度」的时刻。 */
  nextResetAt: number | null
  /** 订阅本身的有效期（毫秒），不是周期。 */
  endAt: number | null
  /** 订阅额度用尽后是否允许回落到钱包余额。 */
  allowWalletOverflow: boolean
}

/** 钱包（充值余额）：只减不重置。 */
export interface NewApiWallet {
  remain: number | null
  used: number
  total: number | null
  unlimited: boolean
  requestCount: number | null
  /** 原始 quota 值，用于核对站点自己的显示口径。 */
  quotaRemain: number | null
  quotaUsed: number | null
}

/**
 * New API 账号额度。
 *
 * 自托管平台，端点由部署方决定，因此账号身份以 `baseUrl` 为主、`keyHint` 为辅。
 *
 * `mode` 决定这张卡归属哪个 Tab：
 * - subscription / both → 有生效订阅，按**周期额度**计费，归「套餐订阅」
 * - wallet → 只有钱包余额（或账单接口回落，无法分辨），归「余额账户」
 *
 * `source` 标明数据来源：管理接口（`api`，需要系统访问令牌，字段完整）或
 * OpenAI 兼容账单接口（`billing`，普通 API Key 可用，无用户名与模型明细）。
 * `unit` 与 source 绑定：管理接口按官方额度单位折算成 USD；账单接口由站点自行折算，
 * 币种无法反推，前端不应带货币符号。
 */
export interface NewApiAccountData {
  baseUrl: string
  /** 站点控制台地址（{baseUrl}/dashboard）。 */
  consoleUrl: string
  /** 站点「可用模型」页（{baseUrl}/pricing）。 */
  modelsUrl: string
  source: 'api' | 'billing'
  unit: 'USD' | 'site'
  username: string | null
  group: string | null
  mode: 'subscription' | 'wallet' | 'both'
  /** 扣费偏好：subscription_first / wallet_first。 */
  billingPreference: string | null
  subscription: NewApiSubscription | null
  wallet: NewApiWallet | null
  /** 当前窗口（订阅周期，或钱包模式的近 30 天）内按模型的用量。 */
  models: NewApiModelUsage[]
  windowStart: number | null
  windowEnd: number | null
  stats: { quota: number; rpm: number; tpm: number } | null
}

export interface NewApiResponse {
  accounts: AccountEnvelope<NewApiAccountData>[]
}
