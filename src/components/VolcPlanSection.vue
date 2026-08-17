<script setup lang="ts">
import type { VolcPlanResponse } from '../types'
import { isFailedAccount } from '../types'
import {
  formatDateTime,
  formatReset,
  formatTokens,
  PLAN_WINDOW_LABELS,
  progressStatus,
  ratioOf,
} from '../utils'

import AccountSection from './AccountSection.vue'

defineProps<{
  data: VolcPlanResponse | null
  loading: boolean
  error: string | null
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
    :empty="data?.accounts.length === 0"
    empty-text="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
        <t-card
          v-for="account in data.accounts"
          :key="account.keyHint"
          size="small"
          header-bordered
        >
          <template #header>
            <t-space align="center" size="small" break-line>
              <t-tag size="small" variant="light-outline" theme="primary">
                {{ account.keyHint }}
              </t-tag>
              <t-tag
                v-if="!isFailedAccount(account)"
                size="small"
                variant="light-outline"
                theme="warning"
              >
                {{ account.planType ?? '未知' }} 套餐
              </t-tag>
              <span v-if="!isFailedAccount(account)" class="account-range">
                {{ account.detailsStart }} ~ {{ account.detailsEnd }}
              </span>
            </t-space>
          </template>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`账号 ${account.keyHint} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <template v-else>
            <t-row :gutter="[12, 12]">
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
              <t-row v-if="account.codingPlan.windows.length > 0" :gutter="[12, 12]">
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

            <t-divider align="left">
              <t-space align="center" size="small">
                <span>模型调用明细</span>
                <span class="muted num">合计 {{ totalOf(account) }}</span>
              </t-space>
            </t-divider>
            <t-table
              :data="detailRows(account)"
              :columns="detailsColumns"
              row-key="_key"
              max-height="360"
              bordered
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
          </template>
        </t-card>
      </t-space>
    </template>
  </AccountSection>
</template>

<style scoped>
.accounts {
  width: 100%;
}

.account-range {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.window-block {
  padding: 12px;
  border: 1px solid var(--td-component-stroke);
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
</style>
