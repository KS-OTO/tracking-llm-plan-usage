<script setup lang="ts">
import { computed } from 'vue'
import type { InferenceUsageData, InferenceUsageResponse } from '../types'
import { accountName, isFailedAccount } from '../types'
import { formatTokens } from '../utils'

import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: InferenceUsageResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
  model: string
}>()

const emit = defineEmits<{
  'update:model': [value: string]
}>()

const columns = [
  { colKey: 'day', title: '日期', width: 110, cell: 'day' },
  { colKey: 'inputTokens', title: '输入 Tokens', align: 'right' as const, cell: 'inputTokens' },
  { colKey: 'outputTokens', title: '输出 Tokens', align: 'right' as const, cell: 'outputTokens' },
  { colKey: 'totalTokens', title: '总 Tokens', align: 'right' as const, cell: 'totalTokens' },
  { colKey: 'requests', title: '请求数', align: 'right' as const, cell: 'requests' },
]

interface AccountTotals {
  input: number
  output: number
  total: number
  requests: number
}

function rowsOf(account: NonNullable<InferenceUsageResponse['accounts']>[number]) {
  if (isFailedAccount(account)) {
    return []
  }
  return (account.rows ?? [])
    .toSorted((a, b) => (a.day < b.day ? 1 : -1))
    .map((row, index) => Object.assign({}, row, { _key: `${row.day}-${index}` }))
}

type AccountCard =
  | {
      account: { keyHint: string; label?: string; error: string }
      failed: true
      totals: null
      rows: []
    }
  | {
      account: InferenceUsageData & { keyHint: string; label?: string }
      failed: false
      totals: AccountTotals
      rows: ReturnType<typeof rowsOf>
    }
const accountCards = computed<AccountCard[]>(() =>
  (props.data?.accounts ?? []).map((account) => {
    if (isFailedAccount(account)) {
      return { account, failed: true, totals: null, rows: [] }
    }
    return {
      account,
      failed: false,
      totals: (account.rows ?? []).reduce(
        (acc, row) => ({
          input: acc.input + row.inputTokens,
          output: acc.output + row.outputTokens,
          total: acc.total + row.totalTokens,
          requests: acc.requests + row.requests,
        }),
        { input: 0, output: 0, total: 0, requests: 0 },
      ),
      rows: rowsOf(account),
    }
  }),
)
</script>

<template>
  <AccountSection
    title="火山方舟 推理用量"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
  >
    <template #actions>
      <t-input
        :value="model"
        placeholder="模型过滤（留空 = 全部）"
        clearable
        aria-label="模型过滤"
        @update:value="(value: string | number) => emit('update:model', String(value))"
      />
    </template>

    <template v-if="data">
      <div class="stack">
        <div v-for="(card, i) in accountCards" :key="card.account.keyHint" class="account-group">
          <div class="account-head">
            <t-tag size="small" variant="light-outline" theme="primary">
              {{ accountName(card.account, i) }}
            </t-tag>
            <span class="key-hint key-hint-secondary">{{ card.account.keyHint }}</span>
          </div>

          <t-alert
            v-if="card.failed"
            theme="error"
            :title="`${accountName(card.account, i)}（${card.account.keyHint}）查询失败`"
            :message="card.account.error"
            :max-line="5"
          />

          <template v-else-if="card.totals">
            <div class="grid-metrics">
              <t-statistic title="总 Token" :value="card.totals.total" :format="formatTokens" />
              <t-statistic title="输入" :value="card.totals.input" :format="formatTokens" />
              <t-statistic title="输出" :value="card.totals.output" :format="formatTokens" />
              <t-statistic title="请求数" :value="card.totals.requests" separator="," />
            </div>

            <t-divider />
            <t-table
              :data="card.rows"
              :columns="columns"
              row-key="_key"
              max-height="360"
              size="small"
            >
              <template #day="{ row }">{{ row.day }}</template>
              <template #inputTokens="{ row }">{{ formatTokens(row.inputTokens) }}</template>
              <template #outputTokens="{ row }">{{ formatTokens(row.outputTokens) }}</template>
              <template #totalTokens="{ row }">{{ formatTokens(row.totalTokens) }}</template>
              <template #requests="{ row }">{{ row.requests.toLocaleString('zh-CN') }}</template>
            </t-table>
          </template>
        </div>
      </div>
    </template>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处无区块特有样式 */
</style>
