<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { api } from './api'
import AliyunSection from './components/AliyunSection.vue'
import DeepSeekSection from './components/DeepSeekSection.vue'
import ExtraSection from './components/ExtraSection.vue'
import GiteeSection from './components/GiteeSection.vue'
import TokenPlanSection from './components/TokenPlanSection.vue'
import VolcPlanSection from './components/VolcPlanSection.vue'
import VolcUsageSection from './components/VolcUsageSection.vue'
import ZhipuSection from './components/ZhipuSection.vue'
import type {
  AliyunPackagesResponse,
  DeepSeekBalanceResponse,
  ExtrasResponse,
  GiteeBalanceResponse,
  InferenceUsageResponse,
  StatusResponse,
  TokenPlanResponse,
  VolcPlanResponse,
  ZhipuPackagesResponse,
} from './types'

const REFRESH_INTERVAL_MS = 60_000
const DETAILS_DAYS = 7

const status = ref<StatusResponse | null>(null)
const deepseek = ref<DeepSeekBalanceResponse | null>(null)
const volcPlan = ref<VolcPlanResponse | null>(null)
const volcInference = ref<InferenceUsageResponse | null>(null)
const zhipu = ref<ZhipuPackagesResponse | null>(null)
const aliyun = ref<AliyunPackagesResponse | null>(null)
const tokenPlan = ref<TokenPlanResponse | null>(null)
const gitee = ref<GiteeBalanceResponse | null>(null)
const extras = ref<ExtrasResponse | null>(null)

const loading = ref(false)
const lastUpdated = ref<Date | null>(null)
const autoRefresh = ref(true)
const modelFilter = ref('')

const deepseekError = ref<string | null>(null)
const volcPlanError = ref<string | null>(null)
const volcInferenceError = ref<string | null>(null)
const zhipuError = ref<string | null>(null)
const aliyunError = ref<string | null>(null)
const tokenPlanError = ref<string | null>(null)
const giteeError = ref<string | null>(null)
const extrasError = ref<string | null>(null)

let timer: ReturnType<typeof setInterval> | undefined

const providerTags = computed(() => {
  const providers = status.value?.providers
  if (!providers) {
    return []
  }
  const labels: Record<string, { name: string; count: number }> = {
    deepseek: { name: 'DeepSeek', count: providers.deepseek.count },
    volc: { name: '火山方舟', count: providers.volc.count },
    zhipu: { name: '智谱', count: providers.zhipu.count },
    aliyun: { name: '阿里云', count: providers.aliyun.count },
    gitee: { name: '模力方舟', count: providers.gitee.count },
  }
  return Object.entries(labels).map(([key, entry]) => ({
    key,
    name: entry.name,
    count: entry.count,
    configured: providers[key as keyof typeof providers].configured,
  }))
})

async function refresh() {
  loading.value = true
  const [
    statusResult,
    deepseekResult,
    planResult,
    inferenceResult,
    zhipuResult,
    aliyunResult,
    tokenPlanResult,
    giteeResult,
    extrasResult,
  ] = await Promise.allSettled([
    api.status(),
    api.deepseekBalance(),
    api.volcPlan(DETAILS_DAYS),
    api.volcInference(DETAILS_DAYS, modelFilter.value.trim() || undefined),
    api.zhipuPackages(),
    api.aliyunPackages(),
    api.aliyunTokenPlan(),
    api.giteeBalance(),
    api.extras(),
  ])

  if (statusResult.status === 'fulfilled') {
    status.value = statusResult.value
  }

  const apply = <T>(
    result: PromiseSettledResult<T>,
    target: { value: T | null },
    errorTarget: { value: string | null },
  ) => {
    if (result.status === 'fulfilled') {
      target.value = result.value
      errorTarget.value = null
    } else {
      errorTarget.value =
        result.reason instanceof Error ? result.reason.message : String(result.reason)
    }
  }

  apply(deepseekResult, deepseek as { value: DeepSeekBalanceResponse | null }, deepseekError)
  apply(planResult, volcPlan as { value: VolcPlanResponse | null }, volcPlanError)
  apply(
    inferenceResult,
    volcInference as { value: InferenceUsageResponse | null },
    volcInferenceError,
  )
  apply(zhipuResult, zhipu as { value: ZhipuPackagesResponse | null }, zhipuError)
  apply(aliyunResult, aliyun as { value: AliyunPackagesResponse | null }, aliyunError)
  apply(tokenPlanResult, tokenPlan as { value: TokenPlanResponse | null }, tokenPlanError)
  apply(giteeResult, gitee as { value: GiteeBalanceResponse | null }, giteeError)
  apply(extrasResult, extras as { value: ExtrasResponse | null }, extrasError)

  loading.value = false
  lastUpdated.value = new Date()
}

function onModelInput(value: string) {
  modelFilter.value = value
  void refresh()
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    if (autoRefresh.value) {
      void refresh()
    }
  }, REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
  if (timer !== undefined) {
    clearInterval(timer)
  }
})
</script>

<template>
  <div class="page">
    <t-navbar title="LLM 用量监控" fixed placeholder>
      <template #right>
        <div class="navbar-actions">
          <span v-if="lastUpdated" class="last-updated">
            {{ lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) }}
          </span>
          <t-switch v-model="autoRefresh" size="small" aria-label="自动刷新" />
          <t-button theme="primary" size="small" shape="round" :loading="loading" @click="refresh">
            刷新
          </t-button>
        </div>
      </template>
    </t-navbar>

    <div class="provider-tags">
      <t-tag
        v-for="tag in providerTags"
        :key="tag.key"
        :theme="tag.configured ? 'success' : 'default'"
        variant="light-outline"
        size="medium"
      >
        {{ tag.name }} ×{{ tag.count }}
      </t-tag>
    </div>

    <DeepSeekSection
      :data="deepseek"
      :loading="loading && deepseek === null"
      :error="deepseekError"
    />
    <VolcPlanSection
      :data="volcPlan"
      :loading="loading && volcPlan === null"
      :error="volcPlanError"
    />
    <VolcUsageSection
      :data="volcInference"
      :loading="loading && volcInference === null"
      :error="volcInferenceError"
      :model="modelFilter"
      @update:model="onModelInput"
    />
    <ZhipuSection :data="zhipu" :loading="loading && zhipu === null" :error="zhipuError" />
    <AliyunSection :data="aliyun" :loading="loading && aliyun === null" :error="aliyunError" />
    <TokenPlanSection
      :data="tokenPlan"
      :loading="loading && tokenPlan === null"
      :error="tokenPlanError"
    />
    <GiteeSection :data="gitee" :loading="loading && gitee === null" :error="giteeError" />
    <ExtraSection :data="extras" :loading="loading && extras === null" :error="extrasError" />

    <footer class="footer">
      <span class="muted">密钥仅保存在服务端环境变量中，页面不接触任何 Key。</span>
      <span class="muted">数据来源：DeepSeek · 火山方舟 · 智谱 · 阿里云 · 模力方舟</span>
    </footer>
  </div>
</template>

<style scoped>
.navbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.last-updated {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.provider-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 2px;
}

.footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  text-align: center;
  padding-top: 8px;
}
</style>
