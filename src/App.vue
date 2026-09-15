<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshIcon, MoonIcon, SunnyIcon } from 'tdesign-icons-vue-next'

import AliyunSection from './components/AliyunSection.vue'
import BaiduSection from './components/BaiduSection.vue'
import DeepSeekSection from './components/DeepSeekSection.vue'
import ExtraSection from './components/ExtraSection.vue'
import GiteeSection from './components/GiteeSection.vue'
import OverviewTab from './components/OverviewTab.vue'
import OpenRouterSection from './components/OpenRouterSection.vue'
import PlansSection from './components/PlansSection.vue'
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
  baidu,
  openrouter,
  extras,
  plans,
  loading,
  lastUpdated,
  autoRefresh,
  modelFilter,
} = storeToRefs(dashboard)
const { refresh, onFilterInput } = dashboard

const theme = useThemeStore()
const { isDark } = storeToRefs(theme)
const { toggle: toggleTheme } = theme

const activeTab = ref<string>('overview')

/** 自动刷新开关联动（含键盘可达补偿：t-switch 1.20.6 无键盘支持，change 事件兜底）。 */
/** 菜单切换：归位滚动，落点可预期（UX：切 Tab 后滚动位置不可预期）。 */
function onMenuChange(): void {
  window.scrollTo({ top: 0 })
}

function onAutoRefreshToggle(): void {
  // v-model 已更新，此处仅作联动钩子（未来可挂统计/持久化）
}

/** 锚点跳转：切 Tab → 等渲染 → 平滑滚动到卡片（手动补偿 sticky header 高度）→ 高亮闪烁。 */
async function jumpToAnchor(tab: string, anchor: string): Promise<void> {
  activeTab.value = tab
  await nextTick()
  // v-show 面板切换后等一帧，再取「可见」的锚点（隐藏面板中的同 id 元素 rect 恒为 0）
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const candidates = document.querySelectorAll(`#anchor-${anchor}`)
  const el = Array.from(candidates).find((node) => (node as HTMLElement).offsetParent !== null)
  if (!el) {
    return
  }
  const headerHeight = document.querySelector('.t-head-menu')?.getBoundingClientRect().height ?? 0
  const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 8
  window.scrollTo({ top, behavior: 'smooth' })
  el.classList.add('anchor-flash')
  window.setTimeout(() => el.classList.remove('anchor-flash'), 1600)
}

/** 全局失败聚合（P0-5）：任一平台刷新失败即在页面顶部给出统一信号与重试。 */
const failedProviders = computed(() => {
  const entries: Array<{ name: string; error: string }> = []
  const check = (name: string, slice: { error: string | null; notConfigured: boolean }) => {
    if (slice.error && !slice.notConfigured) {
      entries.push({ name, error: slice.error })
    }
  }
  check('火山方舟', volcPlan.value)
  check('火山推理', volcInference.value)
  check('智谱 GLM', zhipu.value)
  check('阿里 Token Plan', tokenPlan.value)
  check('DeepSeek', deepseek.value)
  check('阿里资源包', aliyun.value)
  check('模力方舟', gitee.value)
  check('百度千帆', baidu.value)
  check('OpenRouter', openrouter.value)
  check('扩展平台', extras.value)
  check('订阅套餐（Kimi/MiniMax/OpenCode Go）', plans.value)
  return entries
})

const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) {
    return ''
  }
  return lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false })
})
</script>

<template>
  <t-layout class="app-layout">
    <t-header class="app-header">
      <t-head-menu v-model="activeTab" theme="light" class="app-menu" @change="onMenuChange">
        <template #logo>
          <span class="app-title">LLM 用量监控</span>
        </template>
        <t-menu-item value="overview">总览</t-menu-item>
        <t-menu-item value="subscription">套餐订阅</t-menu-item>
        <t-menu-item value="balance">余额账户</t-menu-item>
        <t-menu-item value="extras">扩展平台</t-menu-item>
        <template #operations>
          <t-space size="medium" align="center">
            <span class="last-updated" aria-live="polite">
              更新于 {{ lastUpdatedText || '—' }}
            </span>
            <t-tooltip content="每 60 秒自动刷新，页面隐藏时暂停">
              <span class="switch-wrap">
                <t-switch
                  v-model="autoRefresh"
                  size="small"
                  aria-label="自动刷新开关"
                  @change="onAutoRefreshToggle"
                />
              </span>
            </t-tooltip>
            <t-tooltip content="切换浅色 / 深色主题">
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
            </t-tooltip>
            <t-button theme="primary" :loading="loading" @click="refresh">
              <template #icon><RefreshIcon /></template>
              刷新
            </t-button>
          </t-space>
        </template>
      </t-head-menu>
    </t-header>

    <main class="app-main">
      <!-- 全局失败聚合：N 个平台失败 + 一键重试（P0-5） -->
      <t-alert v-if="failedProviders.length > 0" theme="error" class="global-failure-alert">
        <template #message>
          {{ failedProviders.length }} 个平台刷新失败（{{
            failedProviders.map((p) => p.name).join('、')
          }}），数据可能不是最新
        </template>
        <template #operation>
          <t-button size="small" variant="outline" theme="danger" @click="refresh"> 重试 </t-button>
        </template>
      </t-alert>
      <div v-show="activeTab === 'overview'" id="tab-panel-overview">
        <OverviewTab @jump="jumpToAnchor" />
      </div>
      <div v-show="activeTab === 'subscription'">
        <t-row :gutter="[16, 16]" class="grid-row">
          <t-col :xs="24" :lg="12" :id="'anchor-volc-plan'">
            <VolcPlanSection
              :data="volcPlan.data"
              :loading="loading && volcPlan.data === null"
              :error="volcPlan.error"
              :not-configured="volcPlan.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :lg="12" id="anchor-volc-usage">
            <VolcUsageSection
              :data="volcInference.data"
              :loading="loading && volcInference.data === null"
              :error="volcInference.error"
              :not-configured="volcInference.notConfigured"
              :model="modelFilter"
              @update:model="onFilterInput"
            />
          </t-col>
          <t-col :xs="24" :lg="12" id="anchor-zhipu">
            <ZhipuSection
              variant="plan"
              :data="zhipu.data"
              :loading="loading && zhipu.data === null"
              :error="zhipu.error"
              :not-configured="zhipu.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :lg="12" id="anchor-tokenplan">
            <TokenPlanSection
              :data="tokenPlan.data"
              :loading="loading && tokenPlan.data === null"
              :error="tokenPlan.error"
              :not-configured="tokenPlan.notConfigured"
            />
          </t-col>
          <!-- 订阅套餐（Kimi / MiniMax / OpenCode Go）：同为按窗口计的订阅额度，归入「套餐订阅」 -->
          <t-col :xs="24" id="anchor-plans">
            <PlansSection
              :data="plans.data"
              :loading="loading && plans.data === null"
              :error="plans.error"
              :not-configured="plans.notConfigured"
            />
          </t-col>
        </t-row>
      </div>
      <div v-show="activeTab === 'balance'">
        <t-row :gutter="[16, 16]" class="grid-row">
          <t-col :xs="24" :md="12" :lg="8" id="anchor-zhipu-balance">
            <ZhipuSection
              variant="balance"
              :data="zhipu.data"
              :loading="loading && zhipu.data === null"
              :error="zhipu.error"
              :not-configured="zhipu.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :md="12" :lg="8" id="anchor-deepseek">
            <DeepSeekSection
              :data="deepseek.data"
              :loading="loading && deepseek.data === null"
              :error="deepseek.error"
              :not-configured="deepseek.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :md="12" :lg="8" id="anchor-aliyun">
            <AliyunSection
              :data="aliyun.data"
              :loading="loading && aliyun.data === null"
              :error="aliyun.error"
              :not-configured="aliyun.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :md="12" :lg="8" id="anchor-gitee">
            <GiteeSection
              :data="gitee.data"
              :loading="loading && gitee.data === null"
              :error="gitee.error"
              :not-configured="gitee.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :md="12" :lg="8" id="anchor-baidu">
            <BaiduSection
              :data="baidu.data"
              :loading="loading && baidu.data === null"
              :error="baidu.error"
              :not-configured="baidu.notConfigured"
            />
          </t-col>
          <t-col :xs="24" :md="12" :lg="8" id="anchor-openrouter">
            <OpenRouterSection
              :data="openrouter.data"
              :loading="loading && openrouter.data === null"
              :error="openrouter.error"
              :not-configured="openrouter.notConfigured"
            />
          </t-col>
        </t-row>
      </div>
      <div v-show="activeTab === 'extras'">
        <div id="anchor-extras">
          <ExtraSection
            :data="extras.data"
            :loading="loading && extras.data === null"
            :error="extras.error"
            :not-configured="extras.notConfigured"
          />
        </div>
      </div>

      <footer class="app-footer">
        <span>密钥仅保存在服务端环境变量中，页面不接触任何 Key。</span>
        <span>数据来源：DeepSeek · 火山方舟 · 智谱 · 阿里云 · 模力方舟 · 扩展平台</span>
      </footer>
    </main>

    <t-back-top />
  </t-layout>
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
  flex-shrink: 0;
}

.app-menu {
  height: var(--td-comp-size-xxxl);
  min-height: var(--td-comp-size-xxxl);
  padding: 0 var(--td-size-8);
}

.app-title {
  font-size: var(--td-font-size-title-large);
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.switch-wrap {
  display: inline-flex;
}

.last-updated {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.app-main {
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--td-size-6) var(--td-size-8) var(--td-size-13);
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

/* 锚点落点避开 sticky header（P0-3：scroll-anchoring 标准属性，非视觉样式） */
[id^='anchor-'] {
  scroll-margin-top: calc(var(--td-comp-size-xxxl) + var(--td-comp-margin-s));
}

.anchor-flash :deep(.t-card) {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
  transition: outline 0.3s ease;
}
</style>
