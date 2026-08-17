<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { Component } from 'vue'

import { accountName, isFailedAccount } from '../types'
import { useDashboardStore } from '../stores/dashboard'
import { formatReset } from '../utils'

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
    for (const window of account.windows) {
      consider('火山方舟', account.keyHint, window.window, window.resetTime)
    }
  }
  for (const account of zhipu.value.data?.accounts ?? []) {
    if ('error' in account) {
      continue
    }
    for (const window of account.codingPlan?.windows ?? []) {
      consider('智谱', account.keyHint, window.window, window.nextResetTime)
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

  // 火山：Agent Plan 最紧窗口 + Coding Plan 状态
  const volcAccounts = okAccounts(volcPlan.value.data?.accounts ?? [])
  if (volcAccounts.length > 0) {
    let worstPercent = 0
    let worstReset = 0
    for (const account of volcAccounts) {
      for (const window of account.windows) {
        const percent = window.quota > 0 ? (window.used / window.quota) * 100 : 0
        if (percent > worstPercent) {
          worstPercent = percent
          worstReset = window.resetTime
        }
      }
    }
    out.push({
      key: 'volc',
      name: '火山方舟',
      tab: 'subscription',
      anchor: 'volc-plan',
      primary: `最紧窗口 ${Math.round(worstPercent)}%`,
      secondary: worstReset > 0 ? formatReset(worstReset) : undefined,
      danger: worstPercent >= 90,
    })
  }

  // 智谱：Coding Plan 等级 + 最紧窗口
  const zhipuAccounts = okAccounts(zhipu.value.data?.accounts ?? [])
  if (zhipuAccounts.length > 0) {
    const level = zhipuAccounts[0]?.codingPlan?.level || '—'
    let worstPercent = 0
    for (const account of zhipuAccounts) {
      for (const window of account.codingPlan?.windows ?? []) {
        worstPercent = Math.max(worstPercent, window.percentage)
      }
    }
    out.push({
      key: 'zhipu',
      name: '智谱 GLM',
      tab: 'subscription',
      anchor: 'zhipu',
      primary: `${level} · ${Math.round(worstPercent)}%`,
      secondary: `${zhipuAccounts.length} 账号`,
      danger: worstPercent >= 90,
    })
  }

  // Token Plan 座席剩余
  const tpAccounts = okAccounts(tokenPlan.value.data?.accounts ?? [])
  if (tpAccounts.length > 0) {
    let seats = 0
    let remaining = 0
    for (const account of tpAccounts) {
      seats += account.seats?.total ?? 0
      for (const seat of account.seats?.items ?? []) {
        remaining += seat.equityList?.[0]?.cycleSurplusValue ?? 0
      }
    }
    out.push({
      key: 'tokenplan',
      name: '阿里 Token Plan',
      tab: 'subscription',
      anchor: 'tokenplan',
      primary: `${seats} 座席`,
      secondary: `剩 ${remaining >= 1e6 ? `${(remaining / 1e6).toFixed(2)}M` : Math.round(remaining)} CREDITS`,
    })
  }

  // DeepSeek 余额
  const dsAccounts = okAccounts(deepseek.value.data?.accounts ?? [])
  if (dsAccounts.length > 0) {
    const total = dsAccounts.reduce(
      (sum, account) => sum + account.balances.reduce((s, entry) => s + entry.total, 0),
      0,
    )
    out.push({
      key: 'deepseek',
      name: 'DeepSeek',
      tab: 'balance',
      anchor: 'deepseek',
      primary: `${total.toFixed(2)} CNY`,
      secondary: `${dsAccounts.length} 账号`,
    })
  }

  // 模力方舟：余额 + 代金券
  const giteeAccounts = okAccounts(gitee.value.data?.accounts ?? [])
  if (giteeAccounts.length > 0) {
    const balance = giteeAccounts.reduce((sum, account) => sum + account.balance, 0)
    const voucher = giteeAccounts.reduce(
      (sum, account) =>
        sum +
        (account.voucher && 'data' in account.voucher ? account.voucher.data.couponCashBalance : 0),
      0,
    )
    out.push({
      key: 'gitee',
      name: '模力方舟',
      tab: 'balance',
      anchor: 'gitee',
      primary: `${balance.toFixed(2)} CNY`,
      secondary: voucher > 0 ? `代金券 ${voucher.toFixed(2)}` : undefined,
    })
  }

  // 阿里资源包
  const aliyunAccounts = okAccounts(aliyun.value.data?.accounts ?? [])
  if (aliyunAccounts.length > 0) {
    const packages = aliyunAccounts.reduce((sum, account) => sum + (account.totalCount ?? 0), 0)
    out.push({
      key: 'aliyun',
      name: '阿里资源包',
      tab: 'balance',
      anchor: 'aliyun',
      primary: `${packages} 个包`,
      secondary: `${aliyunAccounts.length} 账号`,
    })
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
            <div v-if="alerts.length > 0" class="alert-list">
              <div
                v-for="(alert, index) in alerts.slice(0, 8)"
                :key="`${alert.platform}-${alert.account}-${index}`"
                class="alert-row"
                role="button"
                tabindex="0"
                @click="
                  jump(
                    alert.platform.includes('Coding') ? 'subscription' : 'subscription',
                    alert.platform.includes('智谱') ? 'zhipu' : 'volc-plan',
                  )
                "
                @keydown.enter="
                  jump('subscription', alert.platform.includes('智谱') ? 'zhipu' : 'volc-plan')
                "
              >
                <t-tag
                  size="small"
                  :theme="alert.percent >= 90 ? 'danger' : 'warning'"
                  variant="light"
                >
                  {{ alert.percent.toFixed(0) }}%
                </t-tag>
                <span class="alert-platform">{{ alert.platform }}</span>
                <span class="alert-account">{{ alert.account }}</span>
                <span class="alert-window">{{ alert.window }}</span>
                <span class="alert-reset">{{ alert.resetText }}</span>
              </div>
              <div v-if="alerts.length > 8" class="muted more-hint">
                还有 {{ alerts.length - 8 }} 项，点击任一行跳转详情
              </div>
            </div>
            <t-empty v-else description="无 ≥70% 的额度窗口" />
          </template>
        </t-card>
      </t-col>

      <!-- 最早重置 + 更新时间 -->
      <t-col :xs="24" :sm="12" :lg="7">
        <t-card title="最近重置" header-bordered size="small">
          <t-empty v-if="!earliestReset" description="无重置窗口" />
          <div v-else class="reset-block">
            <div class="reset-countdown">{{ formatReset(earliestReset.resetTime) }}</div>
            <div class="muted">
              {{ earliestReset.platform }} · {{ earliestReset.account }} ·
              {{
                earliestReset.window === 'fiveHour'
                  ? '5 小时窗口'
                  : earliestReset.window === 'weekly'
                    ? '每周'
                    : earliestReset.window
              }}
            </div>
          </div>
          <template #footer>
            <span class="muted">数据更新于 {{ updatedText || '—' }}</span>
          </template>
        </t-card>
      </t-col>

      <!-- 快速统计 -->
      <t-col :xs="24" :sm="12" :lg="7">
        <t-card title="平台总览" header-bordered size="small">
          <t-empty v-if="summaries.length === 0 && !loading" description="未配置任何平台密钥" />
          <div v-else class="summary-counts">
            <div class="summary-item">
              <span class="summary-value">{{ summaries.length }}</span>
              <span class="muted">已配置平台</span>
            </div>
            <div class="summary-item">
              <span class="summary-value" :class="{ 'text-danger': criticalCount > 0 }">
                {{ criticalCount }}
              </span>
              <span class="muted">紧急 (≥90%)</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ warningCount }}</span>
              <span class="muted">注意 (≥70%)</span>
            </div>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <!-- 平台导航卡：点击直达对应区块 -->
    <t-divider align="left">平台导航（点击直达）</t-divider>
    <t-row :gutter="[12, 12]">
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

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alert-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--td-radius-medium);
  cursor: pointer;
}

.alert-row:hover {
  background: var(--td-bg-color-container-hover);
}

.alert-row:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: -2px;
}

.alert-platform {
  font-weight: 600;
  font-size: 13px;
  min-width: 64px;
}

.alert-account,
.alert-window {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.alert-reset {
  margin-left: auto;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  white-space: nowrap;
}

.more-hint {
  padding: 4px 8px;
}

.reset-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reset-countdown {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.summary-counts {
  display: flex;
  justify-content: space-around;
  padding: 8px 0;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.text-danger {
  color: var(--td-error-color);
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
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}

.nav-secondary {
  font-size: 12px;
  margin-top: 2px;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
</style>
