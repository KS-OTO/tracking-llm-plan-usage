<script setup lang="ts">
import { computed } from 'vue'

import type { VolcPlanResponse } from '../types'
import { formatDateTime, formatReset, formatTokens, PLAN_WINDOW_LABELS, ratioOf } from '../utils'

const props = defineProps<{
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

function windowStatus(percent: number): 'success' | 'warning' | 'danger' {
  if (percent >= 90) {
    return 'danger'
  }
  if (percent >= 70) {
    return 'warning'
  }
  return 'success'
}

const detailsColumns = [
  { colKey: 'time', title: '时间', width: 150, cell: 'time' },
  { colKey: 'objectName', title: '模型', width: 140, cell: 'objectName' },
  { colKey: 'usage', title: '用量', align: 'right' as const, cell: 'usage' },
  { colKey: 'billingType', title: '计费类型', width: 100, cell: 'billingType' },
]

function detailRows(account: NonNullable<VolcPlanResponse['accounts']>[number]) {
  if ('error' in account && account.error) {
    return []
  }
  const data = account as NonNullable<VolcPlanResponse['accounts']>[number] & {
    details?: Array<{ time: number; objectName: string; usage: number; billingType: string }>
  }
  return [...(data.details ?? [])]
    .sort((a, b) => b.time - a.time)
    .map((entry, index) => ({ ...entry, _key: `${entry.time}-${entry.objectName}-${index}` }))
}

const totalOf = (account: NonNullable<VolcPlanResponse['accounts']>[number]): string => {
  if ('error' in account && account.error) {
    return '—'
  }
  const data = account as NonNullable<VolcPlanResponse['accounts']>[number] & {
    details?: Array<{ usage: number; unit?: string }>
  }
  const total = (data.details ?? []).reduce((sum, entry) => sum + entry.usage, 0)
  const unit = data.details?.[0]?.unit ?? 'Tokens'
  return `${formatTokens(total)} ${unit}`
}
</script>

<template>
  <t-cell-group :title="`火山方舟 Agent Plan（${data?.accounts.length ?? 0} 账号）`" theme="card">
    <t-skeleton v-if="loading" animation="gradient" :row="2" />
    <t-cell v-else-if="error" title="查询失败" :note="error" />
    <template v-else-if="data">
      <template v-for="(account, index) in data.accounts" :key="account.keyHint">
        <t-divider v-if="index > 0" />
        <t-cell v-if="account.error" :title="`账号 ${account.keyHint}`" :note="account.error" />
        <div v-else class="td-card">
          <div class="account-head">
            <t-tag size="small" variant="light-outline" theme="primary"
              >账号 {{ account.keyHint }}</t-tag
            >
            <t-tag size="small" variant="light-outline" theme="warning">
              {{ account.planType ?? '未知' }} 套餐
            </t-tag>
            <span class="muted account-range"
              >{{ account.detailsStart }} ~ {{ account.detailsEnd }}</span
            >
          </div>

          <div class="window-grid">
            <div v-for="window in account.windows" :key="window.window" class="window-card">
              <div class="window-head">
                <span class="window-name">{{
                  PLAN_WINDOW_LABELS[window.window] ?? window.window
                }}</span>
                <span class="window-reset">{{ formatReset(window.resetTime) }}</span>
              </div>
              <t-progress
                :percentage="Math.round(ratioOf(window.used, window.quota))"
                :status="windowStatus(ratioOf(window.used, window.quota))"
                :label="false"
                theme="line"
              />
              <div class="window-meta">
                <span class="num"
                  >{{ formatTokens(window.used) }} / {{ formatTokens(window.quota) }}</span
                >
                <span class="num">{{ ratioOf(window.used, window.quota).toFixed(1) }}%</span>
              </div>
              <div class="window-foot">
                重置 {{ window.resetTime > 0 ? formatDateTime(window.resetTime) : '—' }}
              </div>
            </div>
          </div>

          <div v-if="account.codingPlan" class="coding-block">
            <div class="section-head">
              <span class="section-title">Coding Plan 套餐额度</span>
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
            </div>
            <div v-if="account.codingPlan.windows.length > 0" class="window-grid">
              <div
                v-for="window in account.codingPlan.windows"
                :key="window.level"
                class="window-card"
              >
                <div class="window-head">
                  <span class="window-name">{{ codingWindowLabel(window.level) }}</span>
                  <span class="window-reset">{{ formatReset(window.resetTime) }}</span>
                </div>
                <t-progress
                  :percentage="Math.round(Math.min(100, window.percent))"
                  :status="windowStatus(window.percent)"
                  :label="false"
                  theme="line"
                />
                <div class="window-meta">
                  <span>已用 {{ window.percent.toFixed(1) }}%</span>
                  <span class="num">{{ window.percent.toFixed(1) }}%</span>
                </div>
                <div class="window-foot">
                  重置于 {{ window.resetTime > 0 ? formatDateTime(window.resetTime) : '—' }}
                </div>
              </div>
            </div>
            <t-empty v-else description="无 Coding Plan 额度数据（订阅可能已回收或未开通）" />
          </div>

          <t-divider />
          <div class="section-head">
            <span class="section-title">模型调用明细</span>
            <span class="muted num">合计 {{ totalOf(account) }}</span>
          </div>
          <div class="table-scroll">
            <t-table
              :data="detailRows(account)"
              :columns="detailsColumns"
              row-key="_key"
              max-height="360"
              :bordered="true"
            >
              <template #time="{ row }">{{ formatDateTime(row.time) }}</template>
              <template #objectName="{ row }">{{ row.objectName }}</template>
              <template #usage="{ row }"
                ><span class="num">{{ formatTokens(row.usage) }}</span></template
              >
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
          </div>
        </div>
      </template>
      <t-empty
        v-if="data.accounts.length === 0"
        description="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
      />
    </template>
  </t-cell-group>
</template>

<style scoped>
.account-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.account-range {
  font-size: 12px;
}

.coding-block {
  margin-top: 16px;
}
</style>
