<script setup lang="ts">
/**
 * 火山方舟 Agent Plan。
 *
 * 卡片只保留高优先级信息——Agent Plan / Coding Plan 各窗口的额度进度；
 * 套餐类型、明细统计区间、模型调用明细表收进「详情」弹窗。
 */
import type { VolcPlanResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import {
  formatDateTime,
  formatReset,
  formatTokens,
  PLAN_WINDOW_LABELS,
  progressStatus,
  ratioOf,
} from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: VolcPlanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

function codingWindowLabel(level: string): string {
  const normalized = level.toLowerCase()
  if (
    normalized.startsWith('session') ||
    normalized.startsWith('5h') ||
    normalized.startsWith('five')
  ) {
    return '5 小时窗口'
  }
  if (normalized.startsWith('week')) {
    return '每周窗口'
  }
  if (normalized.startsWith('month')) {
    return '每月窗口'
  }
  return level || '—'
}

const detailsColumns = [
  { colKey: 'time', title: '时间', width: 150, cell: 'time' },
  { colKey: 'objectName', title: '模型', width: 140, cell: 'objectName' },
  { colKey: 'usage', title: '用量', align: 'right' as const, cell: 'usage' },
  { colKey: 'billingType', title: '计费类型', width: 100, cell: 'billingType' },
]

function detailRows(account: NonNullable<VolcPlanResponse['accounts']>[number]) {
  if (isFailedAccount(account)) {
    return []
  }
  return account.details
    .toSorted((a, b) => b.time - a.time)
    .map((entry, index) =>
      Object.assign({}, entry, { _key: `${entry.time}-${entry.objectName}-${index}` }),
    )
}

function totalOf(account: NonNullable<VolcPlanResponse['accounts']>[number]): string {
  if (isFailedAccount(account)) {
    return '—'
  }
  const total = account.details.reduce((sum, entry) => sum + entry.usage, 0)
  const unit = account.details[0]?.unit ?? 'Tokens'
  return `${formatTokens(total)} ${unit}`
}
</script>

<template>
  <AccountSection
    title="火山方舟 Agent Plan"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
        <div v-for="account in data.accounts" :key="account.keyHint" class="account-group">
          <div class="account-head">
            <span v-if="account.label" class="account-name">{{ account.label }}</span>
            <span class="key-hint" :class="{ 'key-hint-secondary': account.label }">
              {{ account.keyHint }}
            </span>
            <DetailDialog
              v-if="!isFailedAccount(account)"
              :title="accountTitle(account)"
              :subtitle="account.label ? account.keyHint : undefined"
            >
              <t-descriptions :column="2" size="small" class="detail-block">
                <t-descriptions-item label="别名">
                  {{ account.label || '未配置（用 VOLC_LABEL / VOLC_LABEL_N 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="套餐类型">
                  {{ account.planType ?? '未知' }}
                </t-descriptions-item>
                <t-descriptions-item label="明细区间">
                  <span class="num">{{ account.detailsStart }} ~ {{ account.detailsEnd }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="Coding Plan 状态">
                  {{ account.codingPlan?.status || '—' }}
                </t-descriptions-item>
                <t-descriptions-item label="调用明细合计">
                  <span class="num">{{ totalOf(account) }}</span>
                </t-descriptions-item>
              </t-descriptions>

              <t-divider align="left">模型调用明细（{{ account.details.length }}）</t-divider>
              <t-table
                :data="detailRows(account)"
                :columns="detailsColumns"
                row-key="_key"
                max-height="360"
                size="small"
              >
                <template #time="{ row }">{{ formatDateTime(row.time) }}</template>
                <template #objectName="{ row }">{{ row.objectName }}</template>
                <template #usage="{ row }">{{ formatTokens(row.usage) }}</template>
                <template #billingType="{ row }">
                  <t-tag
                    size="small"
                    variant="light-outline"
                    :theme="row.billingType === 'WithinPlan' ? 'success' : 'warning'"
                  >
                    {{ row.billingType === 'WithinPlan' ? '套餐内' : '套餐外' }}
                  </t-tag>
                </template>
              </t-table>
              <t-empty v-if="account.details.length === 0" description="区间内没有调用明细" />
            </DetailDialog>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountTitle(account)} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <template v-else>
            <t-row :gutter="[16, 16]">
              <t-col
                v-for="window in account.windows"
                :key="window.window"
                :xs="24"
                :sm="12"
                :lg="6"
              >
                <div class="window-block">
                  <t-space align="center" justify="space-between" class="window-head">
                    <strong>{{ PLAN_WINDOW_LABELS[window.window] ?? window.window }}</strong>
                    <span class="muted">{{ formatReset(window.resetTime) }}</span>
                  </t-space>
                  <t-progress
                    :percentage="Math.round(ratioOf(window.used, window.quota))"
                    :status="progressStatus(ratioOf(window.used, window.quota))"
                    :label="false"
                  />
                  <t-space align="center" justify="space-between" class="window-meta">
                    <span class="num"
                      >{{ formatTokens(window.used) }} / {{ formatTokens(window.quota) }}</span
                    >
                    <span class="num">{{ ratioOf(window.used, window.quota).toFixed(1) }}%</span>
                  </t-space>
                  <div class="muted window-foot">
                    重置 {{ window.resetTime > 0 ? formatDateTime(window.resetTime) : '—' }}
                  </div>
                </div>
              </t-col>
            </t-row>

            <div v-if="account.codingPlan" class="coding-block">
              <t-space align="center" size="small" class="section-head">
                <strong>Coding Plan 套餐额度</strong>
                <t-tag
                  v-if="account.codingPlan.status"
                  size="small"
                  variant="light-outline"
                  :theme="
                    account.codingPlan.status === 'NORMAL' || account.codingPlan.status === 'VALID'
                      ? 'success'
                      : 'warning'
                  "
                >
                  {{ account.codingPlan.status }}
                </t-tag>
              </t-space>
              <t-row v-if="account.codingPlan.windows.length > 0" :gutter="[16, 16]">
                <t-col
                  v-for="window in account.codingPlan.windows"
                  :key="window.level"
                  :xs="24"
                  :sm="12"
                  :lg="6"
                >
                  <div class="window-block">
                    <t-space align="center" justify="space-between" class="window-head">
                      <strong>{{ codingWindowLabel(window.level) }}</strong>
                      <span class="muted">{{ formatReset(window.resetTime) }}</span>
                    </t-space>
                    <t-progress
                      :percentage="Math.round(Math.min(100, window.percent))"
                      :status="progressStatus(window.percent)"
                      :label="false"
                    />
                    <t-space align="center" justify="space-between" class="window-meta">
                      <span class="muted">已用 {{ window.percent.toFixed(1) }}%</span>
                      <span class="num">{{ window.percent.toFixed(1) }}%</span>
                    </t-space>
                    <div class="muted window-foot">
                      重置于 {{ window.resetTime > 0 ? formatDateTime(window.resetTime) : '—' }}
                    </div>
                  </div>
                </t-col>
              </t-row>
              <t-empty v-else description="无 Coding Plan 额度数据（订阅可能已回收或未开通）" />
            </div>
          </template>
        </div>
      </t-space>
    </template>
  </AccountSection>
</template>

<style scoped>
.accounts {
  width: 100%;
}

.account-name {
  font-weight: 600;
  font-size: var(--td-font-size-body-large);
}

.key-hint {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.key-hint-secondary {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.detail-block {
  margin-bottom: var(--td-size-4);
}

.window-block {
  padding: var(--td-size-5) var(--td-size-6);
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}

.window-head {
  margin-bottom: 8px;
}

.window-meta {
  margin-top: 8px;
}

.num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.window-foot {
  margin-top: 4px;
}

.coding-block {
  margin-top: 16px;
}

.section-head {
  margin-bottom: 12px;
}

.account-group {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  padding: var(--td-size-5) var(--td-size-6);
}

.account-head {
  display: flex;
  align-items: center;
  gap: var(--td-size-2);
  flex-wrap: wrap;
  margin-bottom: var(--td-size-4);
}
</style>
