<script setup lang="ts">
import type { ExtrasResponse } from '../types'
import { formatDateTime, formatMoney, formatReset } from '../utils'

defineProps<{
  data: ExtrasResponse | null
  loading: boolean
  error: string | null
}>()

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
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
</script>

<template>
  <t-cell-group :title="`其他平台（扩展）（${data?.configured ?? 0} 凭据）`" theme="card">
    <t-skeleton v-if="loading" animation="gradient" :row="2" />
    <t-cell v-else-if="error" title="查询失败" :note="error" />
    <template v-else-if="data">
      <template v-for="group in data.balances" :key="group.provider">
        <div class="group-head">
          <span class="section-title">{{ group.provider }}</span>
          <span class="muted">账户余额 · {{ group.accounts.length }} 账号</span>
        </div>
        <template v-for="(account, index) in group.accounts" :key="account.keyHint">
          <t-divider v-if="index > 0" />
          <t-cell v-if="account.error" :title="`账号 ${account.keyHint}`" :note="account.error" />
          <div v-else class="balance-grid account-gap">
            <div class="balance-cell">
              <t-tag size="small" variant="light-outline" theme="primary">{{
                account.keyHint
              }}</t-tag>
              <span class="balance-value">{{ formatMoney(account.balance, account.unit) }}</span>
              <span v-if="account.total !== undefined" class="balance-label">
                总额 {{ formatMoney(account.total, account.unit) }} · 已用
                {{ formatMoney(account.used ?? 0, account.unit) }}
              </span>
              <span v-if="account.note" class="balance-label muted">{{ account.note }}</span>
            </div>
          </div>
        </template>
      </template>

      <template v-for="group in data.plans" :key="group.provider">
        <div class="group-head">
          <span class="section-title">{{ group.provider }}</span>
          <span class="muted">Token Plan · {{ group.accounts.length }} 账号</span>
        </div>
        <template v-for="(account, index) in group.accounts" :key="account.keyHint">
          <t-divider v-if="index > 0" />
          <t-cell v-if="account.error" :title="`账号 ${account.keyHint}`" :note="account.error" />
          <div v-else class="td-card account-gap">
            <t-tag size="small" variant="light-outline" theme="primary">{{
              account.keyHint
            }}</t-tag>
            <div class="window-grid">
              <div v-for="window in account.windows" :key="window.window" class="window-card">
                <div class="window-head">
                  <span class="window-name">{{
                    WINDOW_LABELS[window.window] ?? window.window
                  }}</span>
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
                  <span v-if="window.resetTime > 0"
                    >重置于 {{ formatDateTime(window.resetTime) }}</span
                  >
                </div>
              </div>
              <t-empty v-if="account.windows.length === 0" description="无额度数据" />
            </div>
          </div>
        </template>
      </template>

      <t-empty
        v-if="data.configured === 0"
        description="未配置扩展平台密钥（STEPFUN / SILICONFLOW / OPENROUTER / NOVITA / KIMI / MINIMAX）"
      />
    </template>
  </t-cell-group>
</template>

<style scoped>
.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0 8px;
}

.account-gap {
  margin-top: 8px;
}
</style>
