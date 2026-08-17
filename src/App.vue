<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshIcon, MoonIcon, SunnyIcon } from 'tdesign-icons-vue-next'

import AliyunSection from './components/AliyunSection.vue'
import DeepSeekSection from './components/DeepSeekSection.vue'
import ExtraSection from './components/ExtraSection.vue'
import GiteeSection from './components/GiteeSection.vue'
import TokenPlanSection from './components/TokenPlanSection.vue'
import VolcPlanSection from './components/VolcPlanSection.vue'
import VolcUsageSection from './components/VolcUsageSection.vue'
import ZhipuSection from './components/ZhipuSection.vue'
import { useDashboardStore } from './stores/dashboard'
import { useThemeStore } from './stores/theme'

const dashboard = useDashboardStore()
const {
  status,
  deepseek,
  volcPlan,
  volcInference,
  zhipu,
  aliyun,
  tokenPlan,
  gitee,
  extras,
  loading,
  lastUpdated,
  autoRefresh,
  modelFilter,
} = storeToRefs(dashboard)
const { refresh, onFilterInput } = dashboard

const theme = useThemeStore()
const { isDark } = storeToRefs(theme)
const { toggle: toggleTheme } = theme

const activeTab = ref<string>('subscription')

const providerTags = computed(() => {
  const providers = status.value.data?.providers
  if (!providers) {
    return []
  }
  return [
    {
      key: 'deepseek',
      name: 'DeepSeek',
      count: providers.deepseek.count,
      configured: providers.deepseek.configured,
    },
    {
      key: 'volc',
      name: '火山方舟',
      count: providers.volc.count,
      configured: providers.volc.configured,
    },
    {
      key: 'zhipu',
      name: '智谱',
      count: providers.zhipu.count,
      configured: providers.zhipu.configured,
    },
    {
      key: 'aliyun',
      name: '阿里云',
      count: providers.aliyun.count,
      configured: providers.aliyun.configured,
    },
    {
      key: 'gitee',
      name: '模力方舟',
      count: providers.gitee.count,
      configured: providers.gitee.configured,
    },
  ]
})

const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) {
    return ''
  }
  return lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false })
})
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-inner">
        <h1 class="app-title">LLM 用量监控</h1>
        <t-space size="medium" align="center">
          <span v-if="lastUpdatedText" class="last-updated">更新于 {{ lastUpdatedText }}</span>
          <t-switch
            v-model="autoRefresh"
            size="small"
            :label="['自动', '手动']"
            aria-label="自动刷新开关"
          />
          <t-button
            theme="default"
            variant="outline"
            :aria-label="isDark ? '切换为浅色模式' : '切换为深色模式'"
            @click="toggleTheme"
          >
            <template #icon>
              <SunnyIcon v-if="isDark" />
              <MoonIcon v-else />
            </template>
          </t-button>
          <t-button theme="primary" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template>
            刷新
          </t-button>
        </t-space>
      </div>
      <div v-if="providerTags.length > 0" class="provider-tags">
        <t-tag
          v-for="tag in providerTags"
          :key="tag.key"
          size="small"
          variant="light-outline"
          :theme="tag.configured ? 'success' : 'default'"
        >
          {{ tag.name }} ×{{ tag.count }}
        </t-tag>
      </div>
    </header>

    <main class="app-main">
      <t-tabs v-model="activeTab" theme="card">
        <t-tab-panel value="subscription" label="套餐订阅">
          <t-row :gutter="[16, 16]" class="grid-row">
            <t-col :xs="24" :lg="12">
              <VolcPlanSection
                :data="volcPlan.data"
                :loading="loading && volcPlan.data === null"
                :error="volcPlan.error"
              />
            </t-col>
            <t-col :xs="24" :lg="12">
              <VolcUsageSection
                :data="volcInference.data"
                :loading="loading && volcInference.data === null"
                :error="volcInference.error"
                :model="modelFilter"
                @update:model="onFilterInput"
              />
            </t-col>
            <t-col :xs="24" :lg="12">
              <ZhipuSection
                :data="zhipu.data"
                :loading="loading && zhipu.data === null"
                :error="zhipu.error"
              />
            </t-col>
            <t-col :xs="24" :lg="12">
              <TokenPlanSection
                :data="tokenPlan.data"
                :loading="loading && tokenPlan.data === null"
                :error="tokenPlan.error"
              />
            </t-col>
          </t-row>
        </t-tab-panel>

        <t-tab-panel value="balance" label="余额账户">
          <t-row :gutter="[16, 16]" class="grid-row">
            <t-col :xs="24" :md="12" :lg="8">
              <DeepSeekSection
                :data="deepseek.data"
                :loading="loading && deepseek.data === null"
                :error="deepseek.error"
              />
            </t-col>
            <t-col :xs="24" :md="12" :lg="8">
              <AliyunSection
                :data="aliyun.data"
                :loading="loading && aliyun.data === null"
                :error="aliyun.error"
              />
            </t-col>
            <t-col :xs="24" :md="12" :lg="8">
              <GiteeSection
                :data="gitee.data"
                :loading="loading && gitee.data === null"
                :error="gitee.error"
              />
            </t-col>
          </t-row>
        </t-tab-panel>

        <t-tab-panel value="extras" label="扩展平台">
          <ExtraSection
            :data="extras.data"
            :loading="loading && extras.data === null"
            :error="extras.error"
          />
        </t-tab-panel>
      </t-tabs>

      <footer class="app-footer">
        <span>密钥仅保存在服务端环境变量中，页面不接触任何 Key。</span>
        <span>数据来源：DeepSeek · 火山方舟 · 智谱 · 阿里云 · 模力方舟</span>
      </footer>
    </main>

    <t-back-top />
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--td-bg-color-page);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-stroke);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 12px 24px;
  flex-wrap: wrap;
}

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  margin: 0;
}

.last-updated {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.provider-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 24px 12px;
}

.app-main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 16px 24px 48px;
}

.grid-row {
  margin-top: 4px;
}

.app-footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  text-align: center;
  padding: 32px 0 8px;
}
</style>
