<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { isFailedAccount } from '../types'
import { useDashboardStore } from '../stores/dashboard'
import { formatReset, formatTokens } from '../utils'

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
  extras,
  baidu,
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
          account: account.label || account.keyHint,
          window:
            window.window === 'fiveHour'
              ? '5h'
              : window.window === 'daily'
                ? '日'
                : window.window === 'weekly'
                  ? '周'
                  : '月',
          percent,
          resetText: formatReset(window.resetTime),
        })
      }
    }
    for (const window of account.codingPlan?.windows ?? []) {
      if (window.percent >= 70) {
        list.push({
          platform: '火山 Coding',
          account: account.label || account.keyHint,
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
    for (const window of account.codingPlan?.windows ?? []) {
      if (window.percentage >= 70) {
        list.push({
          platform: '智谱',
          account: account.label || account.keyHint,
          window: window.window === 'fiveHour' ? '5h' : '周',
          percent: window.percentage,
          resetText: formatReset(window.nextResetTime),
        })
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
    const name = account.label || account.keyHint
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
    for (const window of account.codingPlan?.windows ?? []) {
      consider('智谱', account.label || account.keyHint, window.window, window.nextResetTime)
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
  primary: string
  secondary?: string
  danger?: boolean
}

const summaries = computed<PlatformSummary[]>(() => {
  const out: PlatformSummary[] = []

  /** 平台出卡：失败时显示「查询失败」而非整卡消失（P0-4：失败平台静默蒸发）。 */
  function push(entry: PlatformSummary, failed: boolean): void {
    if (failed) {
      out.push({ ...entry, primary: '查询失败', danger: true })
    } else {
      out.push(entry)
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
        primary: `最紧窗口 ${Math.round(worstPercent)}%`,
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
    const level = zhipuAccounts[0]?.codingPlan?.level || '—'
    let worstPercent = 0
    for (const account of zhipuAccounts) {
      for (const window of account.codingPlan?.windows ?? []) {
        worstPercent = Math.max(worstPercent, window.percentage)
      }
    }
    push(
      {
        key: 'zhipu',
        name: '智谱 GLM',
        tab: 'subscription',
        anchor: 'zhipu',
        primary: `${level} · ${Math.round(worstPercent)}%`,
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
        primary: `${seats} 座席`,
        secondary: `剩 ${remaining >= 1e6 ? `${(remaining / 1e6).toFixed(2)}M` : Math.round(remaining)} CREDITS`,
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
        primary: `${total.toFixed(2)} CNY`,
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
        primary: `${balance.toFixed(2)} CNY`,
        secondary: voucher > 0 ? `代金券 ${voucher.toFixed(2)}` : undefined,
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
        primary: tokens > 0 ? `7 天 ${formatTokens(tokens)}` : `${pkgs} 量包`,
        secondary: baiduAccounts.length > 1 ? `${baiduAccounts.length} 账号` : undefined,
      },
      baiduAccounts.length === 0,
    )
  }

  // 扩展平台计数
  const extrasData = extras.value.data
  if (extrasData && extrasData.configured > 0) {
    out.push({
      key: 'extras',
      name: '扩展平台',
      tab: 'extras',
      anchor: 'extras',
      primary: `${extrasData.configured} 凭据`,
    })
  }

  return out
})

const updatedText = computed(() =>
  lastUpdated.value ? lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false }) : '',
)

const incompleteVars = computed(() => status.value.data?.incomplete ?? [])

const isEmpty = computed(
  () => !loading.value && alerts.value.length === 0 && summaries.value.length === 0,
)

/** 预警行跳转（清除死代码三元：智谱→zhipu 锚点，其余→volc-plan）。 */
function jumpFromAlert(alert: { platform: string }): void {
  const isZhipu = alert.platform.includes('智谱')
  emit('jump', 'subscription', isZhipu ? 'zhipu' : 'volc-plan')
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
    <t-row :gutter="[16, 16]">
      <!-- 预警汇总 -->
      <t-col :xs="24" :lg="10">
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
                      {{ alert.percent.toFixed(0) }}%
                    </t-tag>
                    <span>{{ alert.platform }}</span>
                    <span class="alert-meta">{{ alert.account }}</span>
                    <span class="alert-meta">{{ alert.window }}</span>
                  </t-space>
                </template>
                <template #action>
                  <span class="alert-meta">{{ alert.resetText }}</span>
                </template>
              </t-list-item>
            </t-list>
            <div v-if="alerts.length > 8" class="muted more-hint">
              还有 {{ alerts.length - 8 }} 项预警未展示
            </div>
            <t-empty v-if="alerts.length === 0" description="无 ≥70% 的额度窗口" />
          </template>
        </t-card>
      </t-col>

      <!-- 最早重置 + 更新时间 -->
      <t-col :xs="24" :sm="12" :lg="7">
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
              {{
                earliestReset.window === 'fiveHour'
                  ? '5 小时窗口'
                  : earliestReset.window === 'weekly'
                    ? '每周'
                    : earliestReset.window
              }}
            </div>
          </template>
          <template #footer>
            <span class="muted">数据更新于 {{ updatedText || '—' }}</span>
          </template>
        </t-card>
      </t-col>

      <!-- 快速统计 -->
      <t-col :xs="24" :sm="12" :lg="7">
        <t-card title="平台总览" header-bordered size="small">
          <t-empty v-if="summaries.length === 0 && !loading" description="未配置任何平台密钥" />
          <t-row v-else :gutter="[16, 8]">
            <t-col :span="8">
              <t-statistic title="已配置平台" :value="summaries.length" />
            </t-col>
            <t-col :span="8">
              <t-statistic
                title="紧急 (≥90%)"
                :value="criticalCount"
                :color="criticalCount > 0 ? 'red' : undefined"
              />
            </t-col>
            <t-col :span="8">
              <t-statistic title="注意 (≥70%)" :value="warningCount" />
            </t-col>
          </t-row>
        </t-card>
      </t-col>
    </t-row>

    <!-- 平台导航卡：点击直达对应区块 -->
    <t-divider align="left">平台导航（点击直达）</t-divider>
    <t-row :gutter="[16, 16]">
      <t-col v-for="item in summaries" :key="item.key" :xs="12" :sm="8" :md="6" :lg="4">
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
          <div class="nav-name">{{ item.name }}</div>
          <div class="nav-primary" :class="{ 'text-danger': item.danger }">{{ item.primary }}</div>
          <div v-if="item.secondary" class="muted nav-secondary">{{ item.secondary }}</div>
        </t-card>
      </t-col>
    </t-row>

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
}

.nav-card:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
}

.nav-name {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.nav-primary {
  font-size: var(--td-font-size-title-medium);
  font-family: var(--td-font-family-medium);
  font-variant-numeric: tabular-nums;
  margin-top: var(--td-size-2);
}

.nav-secondary {
  font-size: 12px;
  margin-top: 2px;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.alert-meta {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}

.reset-meta {
  margin-top: var(--td-size-2);
}
</style>
