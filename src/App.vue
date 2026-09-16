<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshIcon, MoonIcon, SunnyIcon } from 'tdesign-icons-vue-next'

import AccountSection from './components/AccountSection.vue'
import AliyunSection from './components/AliyunSection.vue'
import BaiduSection from './components/BaiduSection.vue'
import DeepSeekSection from './components/DeepSeekSection.vue'
import GiteeSection from './components/GiteeSection.vue'
import NewApiSection from './components/NewApiSection.vue'
import OverviewTab from './components/OverviewTab.vue'
import OpenRouterSection from './components/OpenRouterSection.vue'
import PlansSection from './components/PlansSection.vue'
import TokenPlanSection from './components/TokenPlanSection.vue'
import VolcPlanSection from './components/VolcPlanSection.vue'
import ZhipuSection from './components/ZhipuSection.vue'
import { useDashboardStore } from './stores/dashboard'
import { useThemeStore } from './stores/theme'
import type { NewApiResponse } from './types'
import { isFailedAccount } from './types'
import { providerSlug, shouldSpanFullRow, sortPlatformSections } from './utils'

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
  newapi,
  loading,
  lastUpdated,
  nextRefreshAt,
  autoRefresh,
  modelFilter,
  site,
  refreshIntervalSeconds,
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
  check('New API', newapi.value)
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
  newapi: accountCount(newapi.value),
}))

/** 订阅套餐按平台展开：一个平台一个网格单元，卡片标题即平台名。 */
const plansGroups = computed(() => plans.value.data?.plans ?? [])

/**
 * New API 按计费模式拆到两个 Tab。
 *
 * 同一个自托管站点可能同时存在「订阅额度（每周期重置）」与「钱包余额（只减不重置）」，
 * 服务端已经判定好 `mode`：有生效订阅的归「套餐订阅」（周期额度与 Coding Plan 同类），
 * 纯钱包的归「余额账户」。查询失败的账号没有 mode 可言，落到余额账户兜底展示错误。
 */
function newapiByMode(keepSubscription: boolean): NewApiResponse | null {
  const source = newapi.value.data
  if (!source) {
    return null
  }
  const accounts = source.accounts.filter((account) => {
    const hasSubscription = !isFailedAccount(account) && account.subscription !== null
    return keepSubscription ? hasSubscription : !hasSubscription
  })
  return accounts.length > 0 ? { accounts } : null
}

const newapiSubscription = computed(() => newapiByMode(true))
const newapiWallet = computed(() => newapiByMode(false))

/**
 * 平台卡描述符：「名字 / Key 数 / 锚点 / 组件 / props」收成一条数据，才能**排序后再渲染**。
 *
 * 为什么绕这一层：区块卡原本是写死在模板里的静态节点，而「Key 多的平台优先」要求
 * 顺序随运行时账号数变化，静态节点排不了序。收敛成数据后，顺序交给
 * utils.sortPlatformSections（Key 数降序 → 平台名首字母），模板只 v-for 渲染。
 * 泛型把 props 与组件绑定，写错 prop 名在类型检查阶段就会暴露，而不是运行时静默失效。
 */
interface PlatformSection<C extends Component> {
  key: string
  name: string
  /** 该平台的 Key（账号）数 —— 排序第一关键字。 */
  count: number
  anchor: string
  component: C
  props: PropsOf<C>
}

/** 组件公开 props（含 class/key 等 VNodeProps）：由实例类型反推，写错 prop 名能被类型检查拦下。 */
type PropsOf<C> = C extends abstract new (...args: never) => infer Instance
  ? Instance extends { $props: infer Props }
    ? Props
    : Record<string, unknown>
  : Record<string, unknown>

function platformSection<C extends Component>(
  component: C,
  meta: { key: string; name: string; count: number; anchor: string },
  props: PropsOf<C>,
): PlatformSection<C> {
  return { ...meta, component, props }
}

/** 套餐订阅：火山 Agent Plan / 智谱 Coding Plan / 百炼 Token Plan / 各订阅套餐平台。 */
const subscriptionSections = computed(() =>
  sortPlatformSections([
    platformSection(
      VolcPlanSection,
      {
        key: 'volc-plan',
        name: '火山方舟 Agent Plan',
        count: accountCounts.value.volcPlan,
        anchor: 'volc-plan',
      },
      {
        data: volcPlan.value.data,
        inference: volcInference.value.data,
        inferenceError: volcInference.value.error,
        model: modelFilter.value,
        loading: loading.value && volcPlan.value.data === null,
        error: volcPlan.value.error,
        notConfigured: volcPlan.value.notConfigured,
      },
    ),
    platformSection(
      ZhipuSection,
      {
        key: 'zhipu',
        name: '智谱 GLM Coding Plan',
        count: accountCounts.value.zhipu,
        anchor: 'zhipu',
      },
      {
        variant: 'plan',
        data: zhipu.value.data,
        loading: loading.value && zhipu.value.data === null,
        error: zhipu.value.error,
        notConfigured: zhipu.value.notConfigured,
      },
    ),
    platformSection(
      TokenPlanSection,
      {
        key: 'tokenplan',
        name: '阿里云百炼 Token Plan',
        count: accountCounts.value.tokenPlan,
        anchor: 'tokenplan',
      },
      {
        data: tokenPlan.value.data,
        loading: loading.value && tokenPlan.value.data === null,
        error: tokenPlan.value.error,
        notConfigured: tokenPlan.value.notConfigured,
      },
    ),
    ...plansGroups.value.map((group) =>
      platformSection(
        PlansSection,
        {
          key: `plans-${providerSlug(group.provider)}`,
          name: group.provider,
          count: group.accounts.length,
          anchor: `plans-${providerSlug(group.provider)}`,
        },
        { group },
      ),
    ),
    // New API 订阅额度：周期制，与 Coding Plan / Token Plan 同属「套餐订阅」
    ...(newapiSubscription.value
      ? [
          platformSection(
            NewApiSection,
            {
              key: 'newapi-subscription',
              name: 'New API 订阅额度',
              count: newapiSubscription.value.accounts.length,
              anchor: 'newapi-subscription',
            },
            {
              data: newapiSubscription.value,
              loading: loading.value && newapi.value.data === null,
              error: newapi.value.error,
              notConfigured: newapi.value.notConfigured,
            },
          ),
        ]
      : []),
    // 未配置任何订阅套餐密钥时给一张兜底卡（保留 #anchor-plans，总览导航卡仍可跳）
    ...(plansGroups.value.length === 0
      ? [
          platformSection(
            AccountSection,
            { key: 'plans-empty', name: '订阅套餐', count: 0, anchor: 'plans' },
            {
              title: '订阅套餐',
              loading: loading.value && plans.value.data === null,
              error: plans.value.error,
              notConfigured: plans.value.notConfigured,
              empty: plans.value.data?.configured === 0,
              emptyText:
                '未配置订阅套餐密钥（KIMI_API_KEY / MINIMAX_API_KEY / OPENCODE_GO_API_KEY）',
            },
          ),
        ]
      : []),
  ]),
)

/** 余额账户：各平台的余额与资源包。 */
const balanceSections = computed(() =>
  sortPlatformSections([
    platformSection(
      ZhipuSection,
      {
        key: 'zhipu-balance',
        name: '智谱 GLM 余额',
        count: accountCounts.value.zhipu,
        anchor: 'zhipu-balance',
      },
      {
        variant: 'balance',
        data: zhipu.value.data,
        loading: loading.value && zhipu.value.data === null,
        error: zhipu.value.error,
        notConfigured: zhipu.value.notConfigured,
      },
    ),
    platformSection(
      DeepSeekSection,
      {
        key: 'deepseek',
        name: 'DeepSeek 余额',
        count: accountCounts.value.deepseek,
        anchor: 'deepseek',
      },
      {
        data: deepseek.value.data,
        loading: loading.value && deepseek.value.data === null,
        error: deepseek.value.error,
        notConfigured: deepseek.value.notConfigured,
      },
    ),
    platformSection(
      AliyunSection,
      {
        key: 'aliyun',
        name: '阿里云百炼 资源包',
        count: accountCounts.value.aliyun,
        anchor: 'aliyun',
      },
      {
        data: aliyun.value.data,
        loading: loading.value && aliyun.value.data === null,
        error: aliyun.value.error,
        notConfigured: aliyun.value.notConfigured,
      },
    ),
    platformSection(
      GiteeSection,
      {
        key: 'gitee',
        name: '模力方舟（Gitee AI）',
        count: accountCounts.value.gitee,
        anchor: 'gitee',
      },
      {
        data: gitee.value.data,
        loading: loading.value && gitee.value.data === null,
        error: gitee.value.error,
        notConfigured: gitee.value.notConfigured,
      },
    ),
    platformSection(
      BaiduSection,
      { key: 'baidu', name: '百度千帆', count: accountCounts.value.baidu, anchor: 'baidu' },
      {
        data: baidu.value.data,
        loading: loading.value && baidu.value.data === null,
        error: baidu.value.error,
        notConfigured: baidu.value.notConfigured,
      },
    ),
    platformSection(
      OpenRouterSection,
      {
        key: 'openrouter',
        name: 'OpenRouter',
        count: accountCounts.value.openrouter,
        anchor: 'openrouter',
      },
      {
        data: openrouter.value.data,
        loading: loading.value && openrouter.value.data === null,
        error: openrouter.value.error,
        notConfigured: openrouter.value.notConfigured,
      },
    ),
    // New API 钱包余额（无订阅的站点，或查询失败的账号）
    ...(newapiWallet.value
      ? [
          platformSection(
            NewApiSection,
            {
              key: 'newapi',
              name: 'New API 钱包余额',
              count: newapiWallet.value.accounts.length,
              anchor: 'newapi',
            },
            {
              data: newapiWallet.value,
              loading: loading.value && newapi.value.data === null,
              error: newapi.value.error,
              notConfigured: newapi.value.notConfigured,
            },
          ),
        ]
      : []),
  ]),
)

const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) {
    return ''
  }
  return lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false })
})

/**
 * 下一次自动刷新的时刻。
 *
 * 为空代表**没有下一次**（自动刷新已关闭，或页面在后台被暂停），
 * 此时文案落到「已暂停」——比显示一个永不到来的时间更诚实。
 */
const nextRefreshText = computed(() => {
  if (!nextRefreshAt.value) {
    return ''
  }
  return nextRefreshAt.value.toLocaleTimeString('zh-CN', { hour12: false })
})

// ---------------------------------------------------------------------------
// 站点自定义（站点名 / Logo / favicon）：由 /api/status 的 site 字段驱动
// ---------------------------------------------------------------------------

/** 自定义 Logo 加载失败后不再重试，退回纯文字品牌位（避免反复请求破图）。 */
const logoBroken = ref(false)

watch(
  () => site.value.logoUrl,
  () => {
    logoBroken.value = false
  },
)

/** 站点名 → 浏览器标签页标题（index.html 里的 <title> 只是首屏默认值）。 */
watch(
  () => site.value.name,
  (name) => {
    document.title = name
  },
  { immediate: true },
)

/** 写入 <link rel="icon">：不存在则补一个（有些平台会剥掉标签），存在则改 href。 */
function setFaviconHref(url: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) {
    link.href = url
    return
  }
  const created = document.createElement('link')
  created.rel = 'icon'
  created.href = url
  document.head.append(created)
}

/**
 * 站点 favicon → 动态替换标签页图标。
 *
 * 先 `new Image()` 预探测再改 href：探测失败就保留 index.html 里原有的 /favicon.ico，
 * 不会把标签页图标换成破图。`Image` 加载**不受 CORS 限制**（只有 canvas 读回像素才受限），
 * 所以跨域图标可以直接用；但必须是 https —— http 图标在 https 页面上会被按混合内容拦掉。
 */
watch(
  () => site.value.faviconUrl,
  (url) => {
    if (!url) {
      return
    }
    // 用 addEventListener 而不是 onload 赋值：`onload =` 会覆盖已有监听器，
    // 且 { once: true } 更贴合「只探测一次」的意图。
    // 故意**不**注册 error 监听——探测失败就该什么都不做，保留默认图标。
    const probe = new Image()
    probe.addEventListener('load', () => setFaviconHref(url), { once: true })
    probe.src = url
  },
  { immediate: true },
)
</script>

<template>
  <t-layout class="app-layout">
    <t-header class="app-header">
      <t-head-menu v-model="activeTab" theme="light" class="app-menu" @change="onMenuChange">
        <template #logo>
          <span class="app-brand">
            <!-- alt 留空：紧邻的文字标题已经承担了名称语义，再读一遍 Logo 只会重复 -->
            <img
              v-if="site.logoUrl && !logoBroken"
              class="app-logo"
              :src="site.logoUrl"
              alt=""
              @error="logoBroken = true"
            />
            <span class="app-title">{{ site.name }}</span>
          </span>
        </template>
        <t-menu-item value="overview">总览</t-menu-item>
        <t-menu-item value="subscription">套餐订阅</t-menu-item>
        <t-menu-item value="balance">余额账户</t-menu-item>
        <template #operations>
          <t-space size="medium" align="center">
            <!-- 两段独立包裹，窄屏由 CSS 分别取舍（见 layout.css 第 5 节）：
                 平板去掉「更新于 / 下次刷新」前缀只留时间；手机进一步去掉「更新于」，
                 保留用户更关心的「下次刷新」。 -->
            <span class="last-updated" aria-live="polite">
              <span class="last-updated__updated">
                <span class="last-updated__label">更新于</span>
                <span class="num">{{ lastUpdatedText || '—' }}</span>
              </span>
              <span class="last-updated__sep">·</span>
              <span class="last-updated__next">
                <span class="last-updated__label">下次刷新</span>
                <span class="num">{{ nextRefreshText || '已暂停' }}</span>
              </span>
            </span>
            <t-tooltip :content="`每 ${refreshIntervalSeconds} 秒自动刷新，页面隐藏时暂停`">
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
              <span class="app-refresh-text">刷新</span>
            </t-button>
          </t-space>
        </template>
      </t-head-menu>
    </t-header>

    <main class="app-main">
      <!-- 手机上导航只放得下「品牌 + 操作」，时间文案下移到内容区顶部
           （同一份数据渲染两次：header 那份在窄屏被 CSS 隐藏，此份加了 aria-hidden） -->
      <p class="app-status-mobile" aria-hidden="true">
        更新于 {{ lastUpdatedText || '—' }} · 下次刷新 {{ nextRefreshText || '已暂停' }}
      </p>
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
        <!-- 区块网格：同一行卡片强制等高、等宽（断点与原语见 assets/layout.css）。
             顺序由 subscriptionSections 决定：Key 多的平台优先，同数按平台名首字母；
             多 Key（≥2）的区块额外加 .grid-span-all 独占整行，让卡内 Key 两两并排 -->
        <div class="grid-sections">
          <div
            v-for="section in subscriptionSections"
            :key="section.key"
            :id="`anchor-${section.anchor}`"
            :class="{ 'grid-span-all': shouldSpanFullRow(section.count) }"
          >
            <component
              :is="section.component"
              v-bind="section.props"
              @update:model="onFilterInput"
            />
          </div>
        </div>
      </div>
      <div v-show="activeTab === 'balance'">
        <div class="grid-sections grid-sections--3">
          <div
            v-for="section in balanceSections"
            :key="section.key"
            :id="`anchor-${section.anchor}`"
            :class="{ 'grid-span-all': shouldSpanFullRow(section.count) }"
          >
            <component :is="section.component" v-bind="section.props" />
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

/* 尺寸全部走变量：断点在 layout.css 第 6 节统一覆盖。
 * 写死在这里会被 scoped 的高特异性锁住，媒体查询改不动。 */
.app-menu {
  height: var(--app-menu-h);
  min-height: var(--app-menu-h);
  padding: 0 var(--app-gutter);
}

/* 品牌位：Logo + 站点名。min-width:0 让过长的站点名能被省略号截断，
 * 否则 flex 子项的「最小内容宽度」会把导航顶出视口（手机上尤其明显）。 */
.app-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--td-size-3);
  min-width: 0;
}

/* Logo 高度与最大宽度都走变量：断点在 layout.css 第 6 节统一覆盖。
 * width:auto 由高度推出宽度、object-fit:contain 保证任意长宽比的图都不变形；
 * 上限靠 max-width 兜住——用户填的可能是很宽的文字 Logo。 */
.app-logo {
  display: block;
  height: var(--app-logo-h);
  width: auto;
  max-width: var(--app-logo-max-w);
  object-fit: contain;
}

/* 字号同样走变量：手机断点要降一号，写死会被 scoped 特异性锁住。
 * 站点名可自定义，因此必须能截断——绝不靠「名字不会太长」这个假设撑布局。 */
.app-title {
  font-size: var(--app-title-size);
  font-weight: 600;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switch-wrap {
  display: inline-flex;
}

/* inline-flex + gap：时间文案拆成多个 span 后，模板里的换行空白会被编译器折叠掉
 * （.text() 会变成「更新于15:20:36·下次刷新15:21:36」），间距改由 gap 保证 */
.last-updated {
  display: inline-flex;
  align-items: baseline;
  gap: var(--td-size-2);
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
  padding: var(--td-size-6) var(--app-gutter) var(--td-size-13);
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

/* 锚点落点避开 sticky header（P0-3：scroll-anchoring 标准属性，非视觉样式）。
 * 手机导航换行后更高，偏移量由 layout.css 按断点给出。 */
[id^='anchor-'] {
  scroll-margin-top: var(--app-anchor-offset);
}

.anchor-flash :deep(.t-card) {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
  transition: outline 0.3s ease;
}
</style>
