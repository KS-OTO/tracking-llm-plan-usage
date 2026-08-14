<script setup lang="ts">
import type { DeepSeekBalanceResponse } from '../types'
import { formatMoney } from '../utils'

defineProps<{
  data: DeepSeekBalanceResponse | null
  loading: boolean
  error: string | null
}>()
</script>

<template>
  <t-cell-group :title="`DeepSeek 余额（${data?.accounts.length ?? 0} 账号）`" theme="card">
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
            <t-tag
              size="small"
              variant="light-outline"
              :theme="account.isAvailable ? 'success' : 'warning'"
            >
              {{ account.isAvailable ? '可用' : '不可用' }}
            </t-tag>
          </div>
          <div class="balance-grid account-gap">
            <div v-for="entry in account.balances" :key="entry.currency" class="balance-cell">
              <span class="balance-value">{{ formatMoney(entry.total, entry.currency) }}</span>
              <span class="balance-label">{{ entry.currency }} 总余额</span>
              <span class="balance-label"
                >充值 {{ formatMoney(entry.toppedUp, entry.currency) }}</span
              >
              <span class="balance-label"
                >赠金 {{ formatMoney(entry.granted, entry.currency) }}</span
              >
            </div>
          </div>
        </div>
      </template>
      <t-empty v-if="data.accounts.length === 0" description="未配置 DEEPSEEK_API_KEY" />
    </template>
  </t-cell-group>
</template>

<style scoped>
.account-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.account-gap {
  margin-top: 0;
}
</style>
