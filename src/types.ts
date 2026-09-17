export interface ProviderStatus {
  configured: boolean
  count: number
  keyHints: string[]
}

/**
 * 站点自定义（服务端由 `SITE_NAME` / `SITE_LOGO_URL` / `SITE_LOGO_URL_DARK` /
 * `SITE_FAVICON_URL` / `REFRESH_INTERVAL_SECONDS` 运行时读取，随 `/api/status` 下发）。
 *
 * 与 `server/app.ts` 的 `SiteConfig` 是同构契约：server 侧不 import src，
 * 因此两边各声明一份，默认值必须保持一致。
 */
export interface SiteConfig {
  /** 站点标题：导航栏品牌位 + 浏览器标签页。**可以为空串** —— 表示品牌位只显示 Logo
   *  （Logo 本身已是完整字标时很常见），此时标签页标题回落到 `DEFAULT_SITE_NAME`。 */
  name: string
  /** Logo 地址（明亮模式，也是暗黑模式的回落值）；未配置为 null（此时品牌位只显示文字）。 */
  logoUrl: string | null
  /** 暗黑模式专用 Logo 地址；未配置为 null（此时暗黑模式沿用 `logoUrl`）。 */
  logoUrlDark: string | null
  /** favicon 地址；未配置为 null（此时保留 index.html 里的 /favicon.ico）。 */
  faviconUrl: string | null
  /** 自动刷新间隔（秒）。 */
  refreshIntervalSeconds: number
}

export const DEFAULT_SITE_NAME = 'LLM 用量监控'
/** 与 server/app.ts 的 DEFAULT_REFRESH_INTERVAL_SECONDS 保持一致。 */
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 180

/** 服务端未返回 `site` 时的兜底（老服务端 / 非本项目后端）。 */
export const FALLBACK_SITE_CONFIG: SiteConfig = {
  name: DEFAULT_SITE_NAME,
  logoUrl: null,
  logoUrlDark: null,
  faviconUrl: null,
  refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
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
    /** New API（自托管订阅网关，站点地址 + 系统访问令牌成对配置）。 */
    newapi: ProviderStatus
  }
  /** 半配置的成对凭据变量名（只配了 Key 没配 SecretKey）。 */
  incomplete?: string[]
  /** 站点自定义：品牌名 / Logo / favicon / 刷新间隔。 */
  site?: SiteConfig
  now: number
}

/** 多账号响应包裹：成功账号携带数据字段，失败账号仅含错误信息（服务端 runAccounts 契约）。 */
export type AccountEnvelope<T> =
  | (T & { keyHint: string; label?: string })
  | { keyHint: string; label?: string; error: string }

/**
 * 从切片里取数据，失败时返回 null。
 *
 * 做成泛型函数而不是让调用点写 `'data' in slice`：TS 无法对**调用表达式**做收窄，
 * 但函数内部收窄后返回的 `T | null` 是明确的，模板与 computed 里都能直接用。
 */
export function sliceData<T>(slice: { data: T } | { error: string }): T | null {
  return 'data' in slice ? slice.data : null
}

/** 从切片里取错误，成功时返回 null（与 `sliceData` 成对使用）。 */
export function sliceError(slice: { data: unknown } | { error: string }): string | null {
  return 'error' in slice ? slice.error : null
}

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

/**
 * 智谱子查询切片（判别联合）：成功带 `data`，失败只带 `error`。
 *
 * 三个子接口互相独立——Coding Plan 额度接口对未订阅的账号会直接 500，
 * 这时余额与资源包依然查得到，不该跟着一起消失。
 */
export type ZhipuCodingPlanSlice = { data: ZhipuCodingPlanQuota } | { error: string }
export type ZhipuBalanceSlice = { data: ZhipuAccountBalance } | { error: string }
export type ZhipuPackagesSlice = { data: ZhipuTokenPackage[] } | { error: string }

export interface ZhipuPackagesData {
  codingPlan: ZhipuCodingPlanSlice
  balance: ZhipuBalanceSlice
  packages: ZhipuPackagesSlice
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
 * 额度展示类型（官方 `general_setting.go` 的枚举）。站点默认 USD。
 * TOKENS 表示站点把额度按点数展示，此时读数是 quota 原值、没有货币符号。
 */
export type QuotaDisplayType = 'USD' | 'CNY' | 'TOKENS' | 'CUSTOM'

/** 额度口径：类型 + 可直接渲染在数值后的单位串（$ / ¥ / 自定义符号 / 点）。 */
export interface NewApiQuotaUnit {
  type: QuotaDisplayType
  unit: string
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
 * `source` 标明数据来源：管理接口（`api`，需要**系统访问令牌**，字段完整）或
 * OpenAI 兼容账单接口（`billing`，普通 `sk-` 密钥可用，无用户名与模型明细）。
 *
 * `currency` 由服务端读站点的 `/api/status` 得出（USD / CNY / CUSTOM / TOKENS），
 * 数值已按站点设置折算，前端直接用 `unit` 渲染即可；账单接口回落时为 `null`，
 * 表示币种无法反推，此时不要显示任何货币符号。
 */
export interface NewApiAccountData {
  baseUrl: string
  /** 站点控制台地址（{baseUrl}/dashboard）。 */
  consoleUrl: string
  /** 站点「可用模型」页（{baseUrl}/pricing）。 */
  modelsUrl: string
  source: 'api' | 'billing'
  currency: NewApiQuotaUnit | null
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
