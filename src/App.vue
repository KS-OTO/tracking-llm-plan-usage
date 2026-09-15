<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshIcon, MoonIcon, SunnyIcon } from 'tdesign-icons-vue-next'

import AccountSection from './components/AccountSection.vue'
import AliyunSection from './components/AliyunSection.vue'
import BaiduSection from './components/BaiduSection.vue'
import DeepSeekSection from './components/DeepSeekSection.vue'
import GiteeSection from './components/GiteeSection.vue'
import OverviewTab from './components/OverviewTab.vue'
import OpenRouterSection from './components/OpenRouterSection.vue'
import PlansSection from './components/PlansSection.vue'
import TokenPlanSection from './components/TokenPlanSection.vue'
import VolcPlanSection from './components/VolcPlanSection.vue'
import ZhipuSection from './components/ZhipuSection.vue'
import { useDashboardStore } from './stores/dashboard'
import { useThemeStore } from './stores/theme'
import { providerSlug, shouldSpanFullRow } from './utils'

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
  check('订阅套餐（Kimi/MiniMax/OpenCode Go）', plans.value)
  return entries
})

/** 取某个切片的账号数（尚未拿到数据时记 0）。 */
function accountCount(slice: { data: { accounts: readonly unknown[] } | null }): number {
  return slice.data?.accounts.length ?? 0
}

/**
 * 各区块的账号数：决定卡片是否需要**独占整行**。
 *
 * 半宽单元格放不下两张账号卡（1440 视口下每格约 676px，卡内可用约 628px < 2×360px），
 * 于是 2 个 Key 会被挤成「一行一个 + 换行」；整行后卡内 .grid-cards 自然排成两列。
 */
const accountCounts = computed(() => ({
  volcPlan: accountCount(volcPlan.value),
  zhipu: accountCount(zhipu.value),
  tokenPlan: accountCount(tokenPlan.value),
  deepseek: accountCount(deepseek.value),
  aliyun: accountCount(aliyun.value),
  gitee: accountCount(gitee.value),
  baidu: accountCount(baidu.value),
  openrouter: accountCount(openrouter.value),
}))

/** 订阅套餐按平台展开：一个平台一个网格单元，卡片标题即平台名。 */
const plansGroups = computed(() => plans.value.data?.plans ?? [])

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
        <!-- 区块网格：同一行卡片强制等高、等宽（断点与原语见 assets/layout.css）；
             多 Key 的区块再加 .grid-span-all 独占整行，让卡内 Key 两两并排 -->
        <div class="grid-sections">
          <div
            id="anchor-volc-plan"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.volcPlan) }"
          >
            <!-- 火山方舟推理用量已并入 Agent Plan 的详情弹窗（同一对 AK/SK、同一个账号） -->
            <VolcPlanSection
              :data="volcPlan.data"
              :inference="volcInference.data"
              :inference-error="volcInference.error"
              :model="modelFilter"
              :loading="loading && volcPlan.data === null"
              :error="volcPlan.error"
              :not-configured="volcPlan.notConfigured"
              @update:model="onFilterInput"
            />
          </div>
          <div
            id="anchor-zhipu"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.zhipu) }"
          >
            <ZhipuSection
              variant="plan"
              :data="zhipu.data"
              :loading="loading && zhipu.data === null"
              :error="zhipu.error"
              :not-configured="zhipu.notConfigured"
            />
          </div>
          <div
            id="anchor-tokenplan"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.tokenPlan) }"
          >
            <TokenPlanSection
              :data="tokenPlan.data"
              :loading="loading && tokenPlan.data === null"
              :error="tokenPlan.error"
              :not-configured="tokenPlan.notConfigured"
            />
          </div>
          <!-- 订阅套餐（Kimi / MiniMax / OpenCode Go）：一平台一卡，标题即平台名 -->
          <div
            v-for="group in plansGroups"
            :key="group.provider"
            :id="`anchor-plans-${providerSlug(group.provider)}`"
            :class="{ 'grid-span-all': shouldSpanFullRow(group.accounts.length) }"
          >
            <PlansSection :group="group" />
          </div>
          <div v-if="plansGroups.length === 0" id="anchor-plans">
            <AccountSection
              title="订阅套餐"
              :loading="loading && plans.data === null"
              :error="plans.error"
              :not-configured="plans.notConfigured"
              :empty="plans.data?.configured === 0"
              empty-text="未配置订阅套餐密钥（KIMI_API_KEY / MINIMAX_API_KEY / OPENCODE_GO_API_KEY）"
            />
          </div>
        </div>
      </div>
      <div v-show="activeTab === 'balance'">
        <div class="grid-sections grid-sections--3">
          <div
            id="anchor-zhipu-balance"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.zhipu) }"
          >
            <ZhipuSection
              variant="balance"
              :data="zhipu.data"
              :loading="loading && zhipu.data === null"
              :error="zhipu.error"
              :not-configured="zhipu.notConfigured"
            />
          </div>
          <div
            id="anchor-deepseek"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.deepseek) }"
          >
            <DeepSeekSection
              :data="deepseek.data"
              :loading="loading && deepseek.data === null"
              :error="deepseek.error"
              :not-configured="deepseek.notConfigured"
            />
          </div>
          <div
            id="anchor-aliyun"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.aliyun) }"
          >
            <AliyunSection
              :data="aliyun.data"
              :loading="loading && aliyun.data === null"
              :error="aliyun.error"
              :not-configured="aliyun.notConfigured"
            />
          </div>
          <div
            id="anchor-gitee"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.gitee) }"
          >
            <GiteeSection
              :data="gitee.data"
              :loading="loading && gitee.data === null"
              :error="gitee.error"
              :not-configured="gitee.notConfigured"
            />
          </div>
          <div
            id="anchor-baidu"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.baidu) }"
          >
            <BaiduSection
              :data="baidu.data"
              :loading="loading && baidu.data === null"
              :error="baidu.error"
              :not-configured="baidu.notConfigured"
            />
          </div>
          <div
            id="anchor-openrouter"
            :class="{ 'grid-span-all': shouldSpanFullRow(accountCounts.openrouter) }"
          >
            <OpenRouterSection
              :data="openrouter.data"
              :loading="loading && openrouter.data === null"
              :error="openrouter.error"
              :not-configured="openrouter.notConfigured"
            />
          </div>
        </div>
      </div>

      <footer class="app-footer">
        <span>密钥仅保存在服务端环境变量中，页面不接触任何 Key。</span>
        <span>
          数据来源：DeepSeek · 火山方舟 · 智谱 · 阿里云 · 模力方舟 · 百度千帆 · OpenRouter ·
          订阅套餐
        </span>
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
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 主容器：撑满视口后再限制最大宽度并居中。
 * 必须显式 width:100%——t-layout 是 flex column，交叉轴上的 auto 外边距会
 * **压过** align-items:stretch，使本元素退化为「按内容收缩」(实测 1440 视口下仅 1046px)，
 * 内层网格随之塌陷。显式宽度让 stretch 语义回到预期。 */
.app-main {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--td-size-6) var(--td-size-8) var(--td-size-13);
}

.app-footer {
  display: flex;
  flex-direction: column;
  gap: var(--td-size-2);
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
  text-align: center;
  padding: var(--td-size-10) 0 var(--td-size-4);
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
