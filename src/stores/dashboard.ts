/**
 * 仪表盘数据 store：统一拉取全部 /api/*，逐区块独立容错。
 *
 * - refresh 不清空已有数据：失败时保留上次成功值，仅更新 error
 * - 模型过滤带防抖，避免每次击键全量拉取
 * - 自动刷新感知页面可见性，隐藏时暂停
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { defineStore } from 'pinia'

import { api, ApiError } from '../api'
import { FALLBACK_SITE_CONFIG } from '../types'
import type {
  AliyunPackagesResponse,
  BaiduQianfanResponse,
  OpenRouterDetailResponse,
  DeepSeekBalanceResponse,
  GiteeBalanceResponse,
  InferenceUsageResponse,
  NewApiResponse,
  PlansResponse,
  SiteConfig,
  StatusResponse,
  TokenPlanResponse,
  VolcPlanResponse,
  ZhipuPackagesResponse,
} from '../types'

export interface Slice<T> {
  data: T | null
  error: string | null
  /** 服务端 503 NOT_CONFIGURED：未配置密钥（中性空态，非故障）。 */
  notConfigured: boolean
}

const FILTER_DEBOUNCE_MS = 400
const VOLC_DETAILS_DAYS = 7

/**
 * 秒 → 毫秒，并兜住 0 / 负数 / NaN。
 *
 * `setInterval(fn, 0)` 会退化成尽可能快地重复触发，等于把「自动刷新」变成打爆上游的
 * 忙循环，因此非法值必须回落到默认间隔。服务端已做范围钳制，这里是最后一道防线。
 */
function toIntervalMs(seconds: number): number {
  const safe =
    Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_SITE_CONFIG.refreshIntervalSeconds
  return safe * 1000
}

function applyResult<T>(result: PromiseSettledResult<T>, target: Ref<Slice<T>>): void {
  if (result.status === 'fulfilled') {
    target.value = { data: result.value, error: null, notConfigured: false }
    return
  }
  const reason = result.reason
  // NOT_CONFIGURED 是正常初始状态：中性空态而非红色错误
  if (reason instanceof ApiError && reason.code === 'NOT_CONFIGURED') {
    target.value = { data: null, error: null, notConfigured: true }
    return
  }
  target.value = {
    data: target.value.data,
    error: reason instanceof ApiError ? reason.message : String(reason),
    notConfigured: false,
  }
}

export const useDashboardStore = defineStore('dashboard', () => {
  const status = ref<Slice<StatusResponse>>({ data: null, error: null, notConfigured: false })
  const deepseek = ref<Slice<DeepSeekBalanceResponse>>({
    data: null,
    error: null,
    notConfigured: false,
  })
  const volcPlan = ref<Slice<VolcPlanResponse>>({ data: null, error: null, notConfigured: false })
  const volcInference = ref<Slice<InferenceUsageResponse>>({
    data: null,
    error: null,
    notConfigured: false,
  })
  const zhipu = ref<Slice<ZhipuPackagesResponse>>({ data: null, error: null, notConfigured: false })
  const aliyun = ref<Slice<AliyunPackagesResponse>>({
    data: null,
    error: null,
    notConfigured: false,
  })
  const tokenPlan = ref<Slice<TokenPlanResponse>>({ data: null, error: null, notConfigured: false })
  const gitee = ref<Slice<GiteeBalanceResponse>>({ data: null, error: null, notConfigured: false })
  const baidu = ref<Slice<BaiduQianfanResponse>>({ data: null, error: null, notConfigured: false })
  const openrouter = ref<Slice<OpenRouterDetailResponse>>({
    data: null,
    error: null,
    notConfigured: false,
  })
  const plans = ref<Slice<PlansResponse>>({ data: null, error: null, notConfigured: false })
  const newapi = ref<Slice<NewApiResponse>>({ data: null, error: null, notConfigured: false })

  const loading = ref(false)
  const lastUpdated = ref<Date | null>(null)
  /** 下一次自动刷新的时刻；自动刷新关闭或页面隐藏时为 null（此时没有「下次」）。 */
  const nextRefreshAt = ref<Date | null>(null)
  const autoRefresh = ref(true)
  const modelFilter = ref('')

  /**
   * 站点自定义：缺字段一律用兜底值补齐。
   *
   * 用**逐字段合并**而不是整体替换：日志/老版本服务端可能只下发 `{name}`，
   * 整体替换会让 `logoUrl` 变成 undefined 而不是契约里的 null。
   * `/api/status` 整个缺席（或换用非本项目后端）时等同于全用兜底值，
   * 避免首屏品牌位空白、刷新间隔未定义。
   */
  const site = computed<SiteConfig>(() => ({ ...FALLBACK_SITE_CONFIG, ...status.value.data?.site }))

  /** 当前生效的刷新间隔（毫秒）；由站点配置驱动，`/api/status` 返回后重排定时器。 */
  const refreshIntervalMs = ref(toIntervalMs(FALLBACK_SITE_CONFIG.refreshIntervalSeconds))

  /** 供 UI 提示「每 N 秒自动刷新」。 */
  const refreshIntervalSeconds = computed(() => Math.round(refreshIntervalMs.value / 1000))

  let inFlight = false
  let pending = false
  let filterTimer: ReturnType<typeof setTimeout> | undefined
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  /**
   * 单独拉 `/api/status` 并**立即**落地，不等其余 11 路 provider 查询。
   *
   * 站点名 / Logo / favicon / 刷新间隔都在这个切片里，而 provider 查询会真的打到各家
   * 上游接口——最慢的一家足以把品牌文案拖到几秒之后（实测 3.7s，页面一直显示默认站点名）。
   * 品牌属于「页面外观」，不该被数据查询的尾延迟绑架。
   *
   * 返回值表示这次 status 查询本身是否成功：`refresh` 的「至少一个请求成功才更新时间戳」
   * 判定需要它，因此这里把异常收敛成 boolean（而不是让 promise reject，那样
   * allSettled 里就分辨不出「status 失败」了）。
   */
  async function loadStatus(): Promise<boolean> {
    try {
      applyResult({ status: 'fulfilled', value: await api.status() }, status)
      syncRefreshInterval()
      return true
    } catch (reason) {
      applyResult({ status: 'rejected', reason }, status)
      // 拿不到 status 时刷新间隔保持当前值（site 会自动回落到兜底配置）
      syncRefreshInterval()
      return false
    }
  }

  async function refresh(): Promise<void> {
    if (inFlight) {
      // 防抖触发时若上一轮仍在途：标记 pending，落定后补一轮（不丢弃新过滤值）
      pending = true
      return
    }
    inFlight = true
    loading.value = true
    const model = modelFilter.value.trim() || undefined
    // 先起 status：它决定品牌与刷新节奏，要尽早落地（见 loadStatus 注释）
    const statusPromise = loadStatus()
    const results = await Promise.allSettled([
      statusPromise,
      api.deepseekBalance(),
      api.volcPlan(VOLC_DETAILS_DAYS),
      api.volcInference(VOLC_DETAILS_DAYS, model),
      api.zhipuPackages(),
      api.aliyunPackages(),
      api.aliyunTokenPlan(),
      api.giteeBalance(),
      api.baiduQianfan(),
      api.openrouterDetail(),
      api.plans(),
      api.newapi(),
    ])
    inFlight = false
    loading.value = false
    if (pending) {
      pending = false
      void refresh()
    }

    // results[0]（status）已由 loadStatus 自行 apply，这里只处理其余切片
    applyResult(results[1], deepseek)
    applyResult(results[2], volcPlan)
    applyResult(results[3], volcInference)
    applyResult(results[4], zhipu)
    applyResult(results[5], aliyun)
    applyResult(results[6], tokenPlan)
    applyResult(results[7], gitee)
    applyResult(results[8], baidu)
    applyResult(results[9], openrouter)
    applyResult(results[10], plans)
    applyResult(results[11], newapi)

    // 至少一个请求成功才更新时间戳：全部失败时保留旧时间，避免“刚刷新但数据是旧的”误导。
    // status 的成败藏在 loadStatus 的返回值里（它的 promise 恒为 fulfilled），故单独判并跳过下标 0。
    const statusResult = results[0]
    const statusOk = statusResult.status === 'fulfilled' && statusResult.value
    if (statusOk || results.slice(1).some((result) => result.status === 'fulfilled')) {
      lastUpdated.value = new Date()
    }
  }

  function onFilterInput(value: string): void {
    modelFilter.value = value
    clearTimeout(filterTimer)
    filterTimer = setTimeout(() => {
      void refreshInference()
    }, FILTER_DEBOUNCE_MS)
  }

  let inferenceSeq = 0

  /** 模型过滤局部刷新：只重拉火山推理接口，不打扰其余平台。序号守卫丢弃乱序响应。 */
  async function refreshInference(): Promise<void> {
    const seq = ++inferenceSeq
    const model = modelFilter.value.trim() || undefined
    const result = await Promise.allSettled([api.volcInference(VOLC_DETAILS_DAYS, model)])
    if (seq !== inferenceSeq) {
      return
    }
    applyResult(result[0], volcInference)
  }

  /**
   * 定时器回调：页面隐藏或自动刷新关闭时**不刷新**，并把「下次刷新」置空。
   * 显示一个根本不会发生的刷新时间，比不显示更糟（用户会以为数据在动）。
   */
  function tick(): void {
    if (!autoRefresh.value || document.hidden) {
      nextRefreshAt.value = null
      return
    }
    void refresh()
    nextRefreshAt.value = new Date(Date.now() + refreshIntervalMs.value)
  }

  function startTimer(): void {
    clearInterval(refreshTimer)
    refreshTimer = setInterval(tick, refreshIntervalMs.value)
    nextRefreshAt.value = new Date(Date.now() + refreshIntervalMs.value)
  }

  /**
   * 站点配置里的刷新间隔变了就重排定时器。
   *
   * 必须在**取到 /api/status 之后**调用：首挂载时定时器已按兜底间隔启动，
   * 若站点把间隔配成了别的值却不重排，用户要等满一个兜底周期才会看到新节奏。
   */
  function syncRefreshInterval(): void {
    const next = toIntervalMs(site.value.refreshIntervalSeconds)
    if (next === refreshIntervalMs.value) {
      return
    }
    refreshIntervalMs.value = next
    if (autoRefresh.value && !document.hidden) {
      startTimer()
    }
  }

  function stopTimer(): void {
    clearInterval(refreshTimer)
    refreshTimer = undefined
    nextRefreshAt.value = null
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      stopTimer()
      return
    }
    if (autoRefresh.value) {
      void refresh()
      startTimer()
    }
  }

  watch(autoRefresh, (enabled) => {
    if (enabled && !document.hidden) {
      startTimer()
      return
    }
    stopTimer()
  })

  onMounted(() => {
    void refresh()
    if (autoRefresh.value && !document.hidden) {
      startTimer()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    clearInterval(refreshTimer)
    clearTimeout(filterTimer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return {
    status,
    deepseek,
    volcPlan,
    volcInference,
    zhipu,
    aliyun,
    tokenPlan,
    gitee,
    baidu,
    openrouter,
    plans,
    newapi,
    loading,
    lastUpdated,
    nextRefreshAt,
    autoRefresh,
    modelFilter,
    site,
    refreshIntervalMs,
    refreshIntervalSeconds,
    refresh,
    refreshInference,
    onFilterInput,
  }
})
