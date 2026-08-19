/**
 * 仪表盘数据 store：统一拉取全部 /api/*，逐区块独立容错。
 *
 * - refresh 不清空已有数据：失败时保留上次成功值，仅更新 error
 * - 模型过滤带防抖，避免每次击键全量拉取
 * - 自动刷新感知页面可见性，隐藏时暂停
 */
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { defineStore } from 'pinia'

import { api, ApiError } from '../api'
import type {
  AliyunPackagesResponse,
  BaiduQianfanResponse,
  DeepSeekBalanceResponse,
  ExtrasResponse,
  GiteeBalanceResponse,
  InferenceUsageResponse,
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

const REFRESH_INTERVAL_MS = 60_000
const FILTER_DEBOUNCE_MS = 400
const VOLC_DETAILS_DAYS = 7

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
  const extras = ref<Slice<ExtrasResponse>>({ data: null, error: null, notConfigured: false })

  const loading = ref(false)
  const lastUpdated = ref<Date | null>(null)
  const autoRefresh = ref(true)
  const modelFilter = ref('')

  let inFlight = false
  let pending = false
  let filterTimer: ReturnType<typeof setTimeout> | undefined
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  async function refresh(): Promise<void> {
    if (inFlight) {
      // 防抖触发时若上一轮仍在途：标记 pending，落定后补一轮（不丢弃新过滤值）
      pending = true
      return
    }
    inFlight = true
    loading.value = true
    const model = modelFilter.value.trim() || undefined
    const results = await Promise.allSettled([
      api.status(),
      api.deepseekBalance(),
      api.volcPlan(VOLC_DETAILS_DAYS),
      api.volcInference(VOLC_DETAILS_DAYS, model),
      api.zhipuPackages(),
      api.aliyunPackages(),
      api.aliyunTokenPlan(),
      api.giteeBalance(),
      api.baiduQianfan(),
      api.extras(),
    ])
    inFlight = false
    loading.value = false
    if (pending) {
      pending = false
      void refresh()
    }

    applyResult(results[0], status)
    applyResult(results[1], deepseek)
    applyResult(results[2], volcPlan)
    applyResult(results[3], volcInference)
    applyResult(results[4], zhipu)
    applyResult(results[5], aliyun)
    applyResult(results[6], tokenPlan)
    applyResult(results[7], gitee)
    applyResult(results[8], baidu)
    applyResult(results[9], extras)

    // 至少一个请求成功才更新时间戳：全部失败时保留旧时间，避免“刚刷新但数据是旧的”误导
    if (results.some((result) => result.status === 'fulfilled')) {
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

  function onVisibilityChange(): void {
    clearInterval(refreshTimer)
    refreshTimer = undefined
    if (!document.hidden && autoRefresh.value) {
      void refresh()
      refreshTimer = setInterval(() => {
        if (autoRefresh.value && !document.hidden) {
          void refresh()
        }
      }, REFRESH_INTERVAL_MS)
    }
  }

  watch(autoRefresh, (enabled) => {
    clearInterval(refreshTimer)
    refreshTimer = undefined
    if (enabled && !document.hidden) {
      refreshTimer = setInterval(() => {
        if (autoRefresh.value && !document.hidden) {
          void refresh()
        }
      }, REFRESH_INTERVAL_MS)
    }
  })

  onMounted(() => {
    void refresh()
    refreshTimer = setInterval(() => {
      if (autoRefresh.value && !document.hidden) {
        void refresh()
      }
    }, REFRESH_INTERVAL_MS)
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
    extras,
    loading,
    lastUpdated,
    autoRefresh,
    modelFilter,
    refresh,
    refreshInference,
    onFilterInput,
  }
})
