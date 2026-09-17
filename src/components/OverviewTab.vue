<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { accountTitle, isFailedAccount, sliceData } from '../types'
import { modelDocsUrl } from '../modelDocs'
import { useDashboardStore } from '../stores/dashboard'
import { formatCount, formatCurrency, formatTokens } from '../format'
import { formatReset, providerSlug, sortPlatformSections } from '../utils'

const emit = defineEmits<{
  /** 跳转到指定平台卡片：切 Tab + 滚动到锚点。 */
  jump: [tab: string, anchor: string]
}>()

/** 过滤成功账号（判别联合收窄）。 */
function okAccounts<T extends object>(
  accounts: Array<
    (T & { keyHint: string; label?: string }) | { keyHint: string; label?: string; error: string }
  >,
): Array<T & { keyHint: string; label?: string }> {
  return accounts.filter((a): a is T & { keyHint: string; label?: string } => !isFailedAccount(a))
}

const dashboard = useDashboardStore()
const {
  volcPlan,
  zhipu,
  deepseek,
  gitee,
  aliyun,
  tokenPlan,
  plans,
  baidu,
  openrouter,
  status,
  loading,
  lastUpdated,
} = storeToRefs(dashboard)

/** 窗口健康档位：与 utils.progressStatus 同阈值（≥90 error / ≥70 warning）。 */
interface WindowAlert {
  platform: string
  account: string
  window: string
  percent: number
  resetText: string
}

/** 窗口名缩写（预警行/最近重置行共用）。 */
function shortWindow(window: string): string {
  if (window === 'fiveHour') {
    return '5h'
  }
  if (window === 'weekly') {
    return '周'
  }
  if (window === 'monthly') {
    return '月'
  }
  if (window === 'daily') {
    return '日'
  }
  return window
}

const alerts = computed<WindowAlert[]>(() => {
  const list: WindowAlert[] = []
  for (const account of volcPlan.value.data?.accounts ?? []) {
    if ('error' in account) {
      continue
    }
    for (const window of account.windows) {
      const quota = window.quota
      const percent = quota > 0 ? Math.min(100, (window.used / quota) * 100) : 0
      if (percent >= 70) {
        list.push({
          platform: '火山方舟',
          account: accountTitle(account),
          window: shortWindow(window.window),
          percent,
          resetText: formatReset(window.resetTime),
        })
      }
    }
    for (const window of account.codingPlan?.windows ?? []) {
      if (window.percent >= 70) {
        list.push({
          platform: '火山 Coding',
          account: accountTitle(account),
          window: window.level,
          percent: window.percent,
          resetText: formatReset(window.resetTime),
        })
      }
    }
  }
  for (const account of zhipu.value.data?.accounts ?? []) {
    if ('error' in account) {
      continue
    }
    for (const window of sliceData(account.codingPlan)?.windows ?? []) {
      if (window.percentage >= 70) {
        list.push({
          platform: '智谱',
          account: accountTitle(account),
          window: shortWindow(window.window),
          percent: window.percentage,
          resetText: formatReset(window.nextResetTime),
        })
      }
    }
  }
  // 订阅套餐（Kimi / MiniMax / OpenCode Go）：上游限流的窗口同样计入预警
  for (const group of plans.value.data?.plans ?? []) {
    for (const account of group.accounts) {
      if ('error' in account) {
        continue
      }
      for (const window of account.windows) {
        if (window.percent >= 70) {
          list.push({
            platform: group.provider,
            account: accountTitle(account),
            window: shortWindow(window.window),
            percent: window.percent,
            resetText: formatReset(window.resetTime),
          })
        }
      }
    }
  }
  return list.toSorted((a, b) => b.percent - a.percent)
})

const criticalCount = computed(() => alerts.value.filter((a) => a.percent >= 90).length)
const warningCount = computed(() => alerts.value.filter((a) => a.percent < 90).length)

/** 最早重置窗口。 */
const earliestReset = computed(() => {
  let best: { platform: string; account: string; window: string; resetTime: number } | null = null
  const consider = (platform: string, account: string, window: string, resetTime: number) => {
    if (resetTime <= Date.now()) {
      return
    }
    if (!best || resetTime < best.resetTime) {
      best = { platform, account, window, resetTime }
    }
  }
  for (const account of volcPlan.value.data?.accounts ?? []) {
    if ('error' in account) {
      continue
    }
    const name = accountTitle(account)
    for (const window of account.windows) {
      consider('火山方舟', name, window.window, window.resetTime)
    }
    for (const window of account.codingPlan?.windows ?? []) {
      consider('火山 Coding', name, window.level, window.resetTime)
    }
  }
  for (const account of zhipu.value.data?.accounts ?? []) {
    if ('error' in account) {
      continue
    }
    for (const window of sliceData(account.codingPlan)?.windows ?? []) {
      consider('智谱', accountTitle(account), window.window, window.nextResetTime)
    }
  }
  for (const group of plans.value.data?.plans ?? []) {
    for (const account of group.accounts) {
      if ('error' in account) {
        continue
      }
      for (const window of account.windows) {
        consider(group.provider, accountTitle(account), window.window, window.resetTime)
      }
    }
  }
  return best as { platform: string; account: string; window: string; resetTime: number } | null
})

/** 各平台汇总数值（导航卡上的关键数字）。 */
interface PlatformSummary {
  key: string
  name: string
  tab: string
  anchor: string
  /** 该平台的 Key（账号）数 —— 导航卡排序第一关键字（与 App.vue 区块卡同一套规则）。 */
  count: number
  primary: string
  secondary?: string
  danger?: boolean
  /** 「可用模型」文档地址：由 push 按平台名统一注入，各出卡点无需重复传。 */
  modelsUrl?: string | null
}

const summaries = computed<PlatformSummary[]>(() => {
  const out: PlatformSummary[] = []

  /** 平台出卡：失败时显示「查询失败」而非整卡消失（P0-4：失败平台静默蒸发）。 */
  function push(entry: PlatformSummary, failed: boolean): void {
    const withLink = { ...entry, modelsUrl: modelDocsUrl(entry.name) }
    if (failed) {
      out.push({ ...withLink, primary: '查询失败', danger: true })
    } else {
      out.push(withLink)
    }
  }

  // 火山：Agent Plan 最紧窗口 + Coding Plan 状态
  const volcAll = volcPlan.value.data?.accounts ?? []
  const volcAccounts = okAccounts(volcAll)
  if (volcAll.length > 0 || volcPlan.value.error) {
    let worstPercent = 0
    let worstReset = 0
    for (const account of volcAccounts) {
      for (const window of account.windows) {
        const percent = window.quota > 0 ? Math.min(100, (window.used / window.quota) * 100) : 0
        if (percent > worstPercent) {
          worstPercent = percent
          worstReset = window.resetTime
        }
      }
    }
    push(
      {
        key: 'volc',
        name: '火山方舟',
        tab: 'subscription',
        anchor: 'volc-plan',
        count: volcAll.length,
        primary: `最紧窗口 ${formatCount(worstPercent)}%`,
        secondary: worstReset > 0 ? formatReset(worstReset) : undefined,
        danger: worstPercent >= 90,
      },
      volcAccounts.length === 0,
    )
  }

  // 智谱：Coding Plan 等级 + 最紧窗口
  const zhipuAll = zhipu.value.data?.accounts ?? []
  const zhipuAccounts = okAccounts(zhipuAll)
  if (zhipuAll.length > 0 || zhipu.value.error) {
    const firstPlan = zhipuAccounts[0]?.codingPlan
    const level = (firstPlan ? sliceData(firstPlan)?.level : '') || '—'
    let worstPercent = 0
    for (const account of zhipuAccounts) {
      for (const window of sliceData(account.codingPlan)?.windows ?? []) {
        worstPercent = Math.max(worstPercent, window.percentage)
      }
    }
    push(
      {
        key: 'zhipu',
        name: '智谱 GLM',
        tab: 'subscription',
        anchor: 'zhipu',
        count: zhipuAll.length,
        primary: `${level} · ${formatCount(worstPercent)}%`,
        secondary: `${zhipuAccounts.length} 账号`,
        danger: worstPercent >= 90,
      },
      zhipuAccounts.length === 0,
    )
  }

  // Token Plan 座席剩余
  const tpAll = tokenPlan.value.data?.accounts ?? []
  const tpAccounts = okAccounts(tpAll)
  if (tpAll.length > 0 || tokenPlan.value.error) {
    let seats = 0
    let remaining = 0
    for (const account of tpAccounts) {
      seats += account.seats?.total ?? 0
      for (const seat of account.seats?.items ?? []) {
        remaining += seat.equityList?.[0]?.cycleSurplusValue ?? 0
      }
    }
    push(
      {
        key: 'tokenplan',
        name: '阿里 Token Plan',
        tab: 'subscription',
        anchor: 'tokenplan',
        count: tpAll.length,
        primary: `${seats} 座席`,
        secondary: `剩 ${remaining >= 1e6 ? formatTokens(remaining) : formatCount(remaining)} CREDITS`,
      },
      tpAccounts.length === 0,
    )
  }

  // DeepSeek 余额
  const dsAll = deepseek.value.data?.accounts ?? []
  const dsAccounts = okAccounts(dsAll)
  if (dsAll.length > 0 || deepseek.value.error) {
    const total = dsAccounts.reduce(
      (sum, account) => sum + account.balances.reduce((s, entry) => s + entry.total, 0),
      0,
    )
    push(
      {
        key: 'deepseek',
        name: 'DeepSeek',
        tab: 'balance',
        anchor: 'deepseek',
        count: dsAll.length,
        primary: formatCurrency(total, 'CNY'),
        secondary: `${dsAccounts.length} 账号`,
      },
      dsAccounts.length === 0,
    )
  }

  // 模力方舟：余额 + 代金券
  const giteeAll = gitee.value.data?.accounts ?? []
  const giteeAccounts = okAccounts(giteeAll)
  if (giteeAll.length > 0 || gitee.value.error) {
    const balance = giteeAccounts.reduce((sum, account) => sum + account.balance, 0)
    const voucher = giteeAccounts.reduce(
      (sum, account) =>
        sum +
        (account.voucher && 'data' in account.voucher ? account.voucher.data.couponCashBalance : 0),
      0,
    )
    push(
      {
        key: 'gitee',
        name: '模力方舟',
        tab: 'balance',
        anchor: 'gitee',
        count: giteeAll.length,
        primary: formatCurrency(balance, 'CNY'),
        secondary: voucher > 0 ? `代金券 ${formatCurrency(voucher, 'CNY')}` : undefined,
      },
      giteeAccounts.length === 0,
    )
  }

  // 阿里资源包
  const aliyunAll = aliyun.value.data?.accounts ?? []
  const aliyunAccounts = okAccounts(aliyunAll)
  if (aliyunAll.length > 0 || aliyun.value.error) {
    const packages = aliyunAccounts.reduce((sum, account) => sum + (account.totalCount ?? 0), 0)
    push(
      {
        key: 'aliyun',
        name: '阿里资源包',
        tab: 'balance',
        anchor: 'aliyun',
        count: aliyunAll.length,
        primary: `${packages} 个包`,
        secondary: `${aliyunAccounts.length} 账号`,
      },
      aliyunAccounts.length === 0,
    )
  }

  // 百度千帆：量包用量 + TPM
  const baiduAll = baidu.value.data?.accounts ?? []
  const baiduAccounts = okAccounts(baiduAll)
  if (baiduAll.length > 0) {
    const tokens = baiduAccounts.reduce((sum, a) => sum + a.usage.totalTokens, 0)
    const pkgs = baiduAccounts.reduce((sum, a) => sum + a.packages.length, 0)
    push(
      {
        key: 'baidu',
        name: '百度千帆',
        tab: 'balance',
        anchor: 'baidu',
        count: baiduAll.length,
        primary: tokens > 0 ? `7 天 ${formatTokens(tokens)}` : `${pkgs} 量包`,
        secondary: baiduAccounts.length > 1 ? `${baiduAccounts.length} 账号` : undefined,
      },
      baiduAccounts.length === 0,
    )
  }

  // OpenRouter：剩余额度 + 限额
  const orAll = openrouter.value.data?.accounts ?? []
  const orAccounts = okAccounts(orAll)
  if (orAll.length > 0) {
    const balance = orAccounts.reduce((sum, a) => sum + a.balance, 0)
    const withLimit = orAccounts.filter((a) => a.limit !== null)
    push(
      {
        key: 'openrouter',
        name: 'OpenRouter',
        tab: 'balance',
        anchor: 'openrouter',
        count: orAll.length,
        primary: formatCurrency(balance, 'USD'),
        secondary:
          withLimit.length > 0
            ? `限额剩 ${formatCurrency(
                withLimit.reduce((s, a) => s + (a.limitRemaining ?? 0), 0),
                'USD',
              )}`
            : orAccounts[0]?.isFreeTier
              ? '免费层'
              : undefined,
        danger: withLimit.some((a) => (a.limitRemaining ?? 0) <= 1),
      },
      orAccounts.length === 0,
    )
  }

  // 订阅套餐（Kimi / MiniMax / OpenCode Go）：区块已按平台拆卡，导航卡同样一平台一张，
  // 这样点哪家就直达哪家的卡（锚点与 App.vue 用同一个 providerSlug 生成）
  for (const group of plans.value.data?.plans ?? []) {
    const accounts = okAccounts(group.accounts)
    let worstPercent = 0
    for (const account of accounts) {
      for (const window of account.windows) {
        worstPercent = Math.max(worstPercent, window.percent)
      }
    }
    const slug = providerSlug(group.provider)
    push(
      {
        key: `plans-${slug}`,
        name: group.provider,
        tab: 'subscription',
        anchor: `plans-${slug}`,
        count: group.accounts.length,
        primary: `最紧窗口 ${formatCount(worstPercent)}%`,
        secondary: `${group.accounts.length} 账号`,
        danger: worstPercent >= 90,
      },
      accounts.length === 0,
    )
  }

  // 导航卡与 App.vue 的区块卡用同一套顺序：Key 多的平台优先，同数按平台名首字母。
  // 两处若各自排序，就会出现「导航卡第一张点进去是页面第三张」的错位感。
  return sortPlatformSections(out)
})

const updatedText = computed(() =>
  lastUpdated.value ? lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false }) : '',
)

const incompleteVars = computed(() => status.value.data?.incomplete ?? [])

const isEmpty = computed(
  () => !loading.value && alerts.value.length === 0 && summaries.value.length === 0,
)

/** 窗口名中文标签（最近重置行）。 */
function describeWindow(window: string): string {
  if (window === 'fiveHour') {
    return '5 小时窗口'
  }
  if (window === 'weekly') {
    return '每周'
  }
  if (window === 'monthly') {
    return '30 天窗口'
  }
  if (window === 'daily') {
    return '每日'
  }
  return window
}

/** 订阅套餐的已配置平台名（预警行跳转时用来判断「这条预警属于哪张卡」）。 */
const plansProviders = computed(
  () => new Set((plans.value.data?.plans ?? []).map((group) => group.provider)),
)

/** 预警行跳转：智谱 → zhipu 锚点；订阅套餐 → 该平台自己的卡；其余 → 火山 Agent Plan。 */
function jumpFromAlert(alert: { platform: string }): void {
  if (alert.platform.includes('智谱')) {
    emit('jump', 'subscription', 'zhipu')
    return
  }
  if (plansProviders.value.has(alert.platform)) {
    emit('jump', 'subscription', `plans-${providerSlug(alert.platform)}`)
    return
  }
  emit('jump', 'subscription', 'volc-plan')
}

/** t-statistic 文本值：重置倒计时。 */
function resetDisplayValue(reset: {
  platform: string
  account: string
  window: string
  resetTime: number
}): string {
  return formatReset(reset.resetTime)
}

function jump(tab: string, anchor: string): void {
  emit('jump', tab, anchor)
}
</script>

<template>
  <div class="overview">
    <!-- 半配置检测：只配了一半的成对凭据 -->
    <t-alert
      v-if="incompleteVars.length > 0"
      theme="warning"
      title="检测到不完整的凭据配置"
      :message="`以下变量缺少配对项，对应平台不会启用：${incompleteVars.join('、')}（请补齐后重启服务）`"
    />
    <div class="grid-sections grid-sections--3">
      <!-- 预警汇总 -->
      <div>
        <t-card title="额度预警" header-bordered size="small">
          <template #actions>
            <t-space size="small">
              <t-tag v-if="criticalCount > 0" theme="danger" variant="light">
                {{ criticalCount }} 个 ≥90%
              </t-tag>
              <t-tag v-else-if="warningCount > 0" theme="warning" variant="light">
                {{ warningCount }} 个 ≥70%
              </t-tag>
              <t-tag v-else theme="success" variant="light">全部健康</t-tag>
            </t-space>
          </template>
          <t-skeleton
            v-if="loading && alerts.length === 0"
            :loading="true"
            animation="gradient"
            :row-col="[1, 1, 1]"
          />
          <template v-else>
            <t-list v-if="alerts.length > 0" :split="true">
              <t-list-item
                v-for="(alert, index) in alerts.slice(0, 8)"
                :key="`${alert.platform}-${alert.account}-${index}`"
                @click="jumpFromAlert(alert)"
              >
                <template #content>
                  <t-space size="small" align="center">
                    <t-tag
                      size="small"
                      :theme="alert.percent >= 90 ? 'danger' : 'warning'"
                      variant="light"
                    >
                      {{ formatCount(alert.percent) }}%
                    </t-tag>
                    <span>{{ alert.platform }}</span>
                    <span class="text-secondary">{{ alert.account }}</span>
                    <span class="text-secondary">{{ alert.window }}</span>
                  </t-space>
                </template>
                <template #action>
                  <span class="text-secondary">{{ alert.resetText }}</span>
                </template>
              </t-list-item>
            </t-list>
            <div v-if="alerts.length > 8" class="muted">
              还有 {{ alerts.length - 8 }} 项预警未展示
            </div>
            <t-empty v-if="alerts.length === 0" description="无 ≥70% 的额度窗口" />
          </template>
        </t-card>
      </div>

      <!-- 最早重置 + 更新时间 -->
      <div>
        <t-card title="最近重置" header-bordered size="small">
          <t-empty v-if="!earliestReset" description="无重置窗口" />
          <template v-else>
            <t-statistic
              title="最近一次窗口重置"
              :value="earliestReset.resetTime"
              :format="() => formatReset(earliestReset?.resetTime ?? 0)"
            />
            <div class="muted reset-meta">
              {{ earliestReset.platform }} · {{ earliestReset.account }} ·
              {{ describeWindow(earliestReset.window) }}
            </div>
          </template>
          <template #footer>
            <span class="muted">数据更新于 {{ updatedText || '—' }}</span>
          </template>
        </t-card>
      </div>

      <!-- 快速统计 -->
      <div>
        <t-card title="平台总览" header-bordered size="small">
          <t-empty v-if="summaries.length === 0 && !loading" description="未配置任何平台密钥" />
          <div v-else class="grid-metrics">
            <t-statistic title="已配置平台" :value="summaries.length" :decimal-places="0" />
            <t-statistic
              title="紧急 (≥90%)"
              :value="criticalCount"
              :color="criticalCount > 0 ? 'red' : undefined"
              :decimal-places="0"
            />
            <t-statistic title="注意 (≥70%)" :value="warningCount" :decimal-places="0" />
          </div>
        </t-card>
      </div>
    </div>

    <!-- 平台导航卡：点击直达对应区块 -->
    <t-divider align="left">平台导航（点击直达）</t-divider>
    <div class="grid-cards grid-cards--tight grid-cards--stretch">
      <div v-for="item in summaries" :key="item.key">
        <t-card
          size="small"
          hover-shadow
          class="nav-card"
          role="button"
          tabindex="0"
          :aria-label="`跳转到 ${item.name}`"
          @click="jump(item.tab, item.anchor)"
          @keydown.enter="jump(item.tab, item.anchor)"
        >
          <div class="nav-head">
            <span class="nav-name">{{ item.name }}</span>
            <!-- 外链与整卡跳转共存：卡片点击是「滚到该平台」，链接是「打开文档」，
                 两者必须 stop 隔开，否则点链接会顺带把页面滚走 -->
            <a
              v-if="item.modelsUrl"
              class="models-link"
              :href="item.modelsUrl"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`${item.name} 可用模型文档（新窗口打开）`"
              @click.stop
              @keydown.enter.stop
            >
              可用模型 ↗
            </a>
          </div>
          <div class="nav-primary" :class="{ 'text-danger': item.danger }">{{ item.primary }}</div>
          <div v-if="item.secondary" class="muted nav-secondary">{{ item.secondary }}</div>
        </t-card>
      </div>
    </div>

    <t-empty
      v-if="isEmpty"
      description="未配置任何平台密钥：复制 .env.example 为 .env 填入 Key 后重启服务"
    />
  </div>
</template>

<style scoped>
.overview {
  width: 100%;
}

.nav-card {
  cursor: pointer;
  /* 同行导航卡等高（.grid-cards--stretch 把 t-card 纵向铺满单元格），
     卡内改为纵向弹性：次级文案被推到卡底，各卡的读数行因此严格对齐 */
  display: flex;
  flex-direction: column;
}

/* t-card 的 body 默认 display:flow-root（不参与纵向分配），
   这里只在本组件自己的 .nav-card 范围内把它变成弹性列，让内容能吃掉多余高度 */
.nav-card :deep(.t-card__body) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.nav-card:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
}

.nav-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--td-size-2);
}

.nav-name {
  font-size: var(--td-font-size-body-medium);
  color: var(--td-text-color-secondary);
}

.nav-primary {
  font-size: var(--td-font-size-title-medium);
  font-family: var(--td-font-family-medium);
  font-variant-numeric: tabular-nums;
  margin-top: var(--td-size-2);
}

/* .muted 已给出字号，这里只补上「与主读数之间」的呼吸；
 * margin-top:auto 让本行永远贴着卡底——导航卡等高后，短卡不会留下悬空的白 */
.nav-secondary {
  margin-top: auto;
  padding-top: var(--td-size-1);
}

/* .muted 已给出字号与边距，这里只补上与其他块的间距 */
.reset-meta {
  margin-top: var(--td-size-2);
}
</style>
