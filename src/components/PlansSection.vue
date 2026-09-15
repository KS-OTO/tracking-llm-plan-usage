<script setup lang="ts">
/**
 * 套餐订阅 Tab 的「订阅套餐」区块：Kimi For Coding / MiniMax / OpenCode Go。
 *
 * 这三家都是**按窗口计的订阅额度**，与火山 Agent Plan、智谱 Coding Plan、百炼 Token Plan
 * 同类，因此与余额类扩展平台（/api/extras）分属不同 Tab、不同接口（/api/plans）。
 *
 * 卡片只保留高优先级信息：窗口进度条 + 上游异常状态；账号身份与窗口明细收进「详情」弹窗。
 */
import type { ExtrasPlan, PlansResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatDateTime, formatReset, progressStatus } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: PlansResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
  monthly: '30 天窗口',
}

/** 上游窗口状态的展示文案；未收录的状态原样回退显示，不隐藏信息。 */
const WINDOW_STATUS_LABELS: Record<string, string> = {
  'rate-limited': '上游限流中',
}

function windowStatusLabel(status: string): string {
  return WINDOW_STATUS_LABELS[status] ?? status
}

function windowStatusNote(status: string): string {
  return status === 'rate-limited'
    ? '该窗口已被上游限流，期间的请求可能被拒绝；百分比仍为已用额度'
    : `上游返回的窗口状态：${status}`
}

/** 各平台用量端点（详情弹窗内的「数据来源」，排障时用得上）。 */
const PROVIDER_ENDPOINTS: Record<string, string> = {
  'Kimi For Coding': 'GET api.kimi.com/coding/v1/usages',
  MiniMax: 'GET api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
  'OpenCode Go': 'GET opencode.ai/zen/go/v1/usage',
}

function endpointOf(provider: string): string {
  return PROVIDER_ENDPOINTS[provider] ?? '—'
}

const windowColumns = [
  { colKey: 'window', title: '窗口', width: 110, cell: 'window' },
  { colKey: 'percent', title: '已用', align: 'right' as const, cell: 'percent' },
  { colKey: 'status', title: '上游状态', width: 120, cell: 'status' },
  { colKey: 'reset', title: '重置倒计时', width: 140, cell: 'reset' },
  { colKey: 'resetAt', title: '重置时间', width: 180, cell: 'resetAt' },
]

function windowRows(account: ExtrasPlan) {
  return account.windows.map((window) => Object.assign({}, window, { _key: window.window }))
}
</script>

<template>
  <AccountSection
    title="订阅套餐"
    :subtitle="`${data?.configured ?? 0} 凭据`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.configured === 0"
    empty-text="未配置订阅套餐密钥（KIMI_API_KEY / MINIMAX_API_KEY / OPENCODE_GO_API_KEY）"
  >
    <template v-if="data">
      <div class="stack">
        <div v-for="group in data.plans" :key="group.provider" class="stack stack--tight">
          <div class="group-head">
            <strong>{{ group.provider }}</strong>
            <span class="muted">订阅额度 · {{ group.accounts.length }} 账号</span>
          </div>
          <div class="grid-cards grid-cards--wide">
            <div v-for="account in group.accounts" :key="account.keyHint" class="account-group">
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
                  <t-descriptions :column="1" size="small" class="detail-block">
                    <t-descriptions-item label="别名">
                      {{ account.label || '未配置（用 *_LABEL / *_LABEL_N 设置）' }}
                    </t-descriptions-item>
                    <t-descriptions-item label="平台">
                      {{ group.provider }}
                    </t-descriptions-item>
                    <t-descriptions-item label="数据来源">
                      <span class="num">{{ endpointOf(group.provider) }}</span>
                    </t-descriptions-item>
                  </t-descriptions>
                  <t-table
                    :data="windowRows(account)"
                    :columns="windowColumns"
                    row-key="_key"
                    size="small"
                  >
                    <template #window="{ row }">
                      {{ WINDOW_LABELS[row.window] ?? row.window }}
                    </template>
                    <template #percent="{ row }">
                      <span class="num">{{ row.percent.toFixed(1) }}%</span>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.status" size="small" theme="warning" variant="light-outline">
                        {{ windowStatusLabel(row.status) }}
                      </t-tag>
                      <span v-else class="muted">正常</span>
                    </template>
                    <template #reset="{ row }">{{ formatReset(row.resetTime) }}</template>
                    <template #resetAt="{ row }">
                      {{ row.resetTime > 0 ? formatDateTime(row.resetTime) : '—' }}
                    </template>
                  </t-table>
                  <div class="muted detail-hint">{{ account.windows.length }} 个额度窗口</div>
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
                <div v-for="window in account.windows" :key="window.window" class="window-block">
                  <t-space align="center" justify="space-between" class="window-head">
                    <t-space align="center" size="small">
                      <strong>{{ WINDOW_LABELS[window.window] ?? window.window }}</strong>
                      <t-tag
                        v-if="window.status"
                        size="small"
                        theme="warning"
                        variant="light-outline"
                      >
                        {{ windowStatusLabel(window.status) }}
                      </t-tag>
                    </t-space>
                    <span class="muted">{{ formatReset(window.resetTime) }}</span>
                  </t-space>
                  <t-progress
                    :percentage="Math.round(Math.min(100, window.percent))"
                    :status="progressStatus(window.percent)"
                    :label="false"
                  />
                  <t-space align="center" justify="space-between" class="window-meta">
                    <span class="muted">已用 {{ window.percent.toFixed(1) }}%</span>
                    <span class="num-strong">{{ window.percent.toFixed(1) }}%</span>
                  </t-space>
                  <div v-if="window.status" class="muted window-foot">
                    {{ windowStatusNote(window.status) }}
                  </div>
                </div>
                <t-empty v-if="account.windows.length === 0" description="无额度数据" />
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处仅保留本区块特有样式 */
.detail-hint {
  margin-top: var(--td-size-4);
}
</style>
