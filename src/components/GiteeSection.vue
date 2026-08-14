<script setup lang="ts">
import type { GiteeBalanceResponse } from '../types'
import { formatMoney } from '../utils'

defineProps<{
  data: GiteeBalanceResponse | null
  loading: boolean
  error: string | null
}>()
</script>

<template>
  <t-cell-group :title="`模力方舟（Gitee AI）（${data?.accounts.length ?? 0} 账号）`" theme="card">
    <t-skeleton v-if="loading" animation="gradient" :row="2" />
    <t-cell v-else-if="error" title="查询失败" :note="error" />
    <template v-else-if="data">
      <template v-for="(account, index) in data.accounts" :key="account.keyHint">
        <t-divider v-if="index > 0" />
        <t-cell v-if="account.error" :title="`账号 ${account.keyHint}`" :note="account.error" />
        <div v-else class="td-card">
          <t-tag size="small" variant="light-outline" theme="primary"
            >账号 {{ account.keyHint }}</t-tag
          >
          <div class="balance-grid account-gap">
            <div class="balance-cell">
              <span class="balance-value">{{ formatMoney(account.balance, 'CNY') }}</span>
              <span class="balance-label">剩余余额</span>
            </div>
            <div class="balance-cell">
              <span class="balance-value">{{ formatMoney(account.usedAmount, 'CNY') }}</span>
              <span class="balance-label">已使用</span>
            </div>
            <div class="balance-cell">
              <span class="balance-value">{{ formatMoney(account.totalAmount, 'CNY') }}</span>
              <span class="balance-label">总金额</span>
            </div>
          </div>
          <t-divider />
          <div class="section-title">资源包明细（{{ account.details.length }}）</div>
          <div v-if="account.details.length > 0" class="table-scroll">
            <t-table
              :data="account.details"
              :columns="[
                { colKey: 'name', title: '资源包', width: 160, cell: 'name' },
                { colKey: 'amount', title: '总金额', align: 'right', cell: 'amount' },
                { colKey: 'balance', title: '余额', align: 'right', cell: 'balance' },
              ]"
              row-key="ident"
              max-height="360"
              :bordered="true"
            >
              <template #name="{ row }">{{ row.name || row.ident || '未命名资源包' }}</template>
              <template #amount="{ row }">{{ formatMoney(row.amount, 'CNY') }}</template>
              <template #balance="{ row }">
                <span class="num">{{ formatMoney(row.balance, 'CNY') }}</span>
              </template>
            </t-table>
          </div>
          <t-empty v-else description="没有资源包" />
        </div>
      </template>
      <t-empty v-if="data.accounts.length === 0" description="未配置 GITEE_AI_API_KEY" />
    </template>
  </t-cell-group>
</template>

<style scoped>
.account-gap {
  margin-top: 12px;
}
</style>
