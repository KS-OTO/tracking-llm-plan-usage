<script setup lang="ts">
import { computed } from 'vue'

import type { InferenceUsageResponse } from '../types'
import { formatTokens } from '../utils'

const props = defineProps<{
  data: InferenceUsageResponse | null
  loading: boolean
  error: string | null
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

function rowsOf(account: NonNullable<InferenceUsageResponse['accounts']>[number]) {
  if ('error' in account && account.error) {
    return []
  }
  const data = account as NonNullable<InferenceUsageResponse['accounts']>[number] & {
    rows?: Array<{
      day: string
      inputTokens: number
      outputTokens: number
      totalTokens: number
      requests: number
    }>
  }
  return [...(data.rows ?? [])]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((row, index) => ({ ...row, _key: `${row.day}-${index}` }))
}

const totalsOf = (account: NonNullable<InferenceUsageResponse['accounts']>[number]) => {
  if ('error' in account && account.error) {
    return null
  }
  const data = account as NonNullable<InferenceUsageResponse['accounts']>[number] & {
    rows?: Array<{
      inputTokens: number
      outputTokens: number
      totalTokens: number
      requests: number
    }>
  }
  return (data.rows ?? []).reduce(
    (acc, row) => ({
      input: acc.input + row.inputTokens,
      output: acc.output + row.outputTokens,
      total: acc.total + row.totalTokens,
      requests: acc.requests + row.requests,
    }),
    { input: 0, output: 0, total: 0, requests: 0 },
  )
}

const activeAccounts = computed(() => props.data?.accounts ?? [])
</script>

<template>
  <t-cell-group :title="`火山方舟 推理用量（${activeAccounts.length} 账号）`" theme="card">
    <t-skeleton v-if="loading" animation="gradient" :row="2" />
    <t-cell v-else-if="error" title="查询失败" :note="error" />
    <template v-else-if="data">
      <div class="filter-row">
        <t-input
          :value="model"
          placeholder="模型过滤（留空 = 全部）"
          clearable
          @update:value="(value: string | number) => emit('update:model', String(value))"
        />
      </div>
      <template v-for="(account, index) in activeAccounts" :key="account.keyHint">
        <t-divider v-if="index > 0" />
        <t-cell v-if="account.error" :title="`账号 ${account.keyHint}`" :note="account.error" />
        <div v-else class="td-card">
          <t-tag size="small" variant="light-outline" theme="primary"
            >账号 {{ account.keyHint }}</t-tag
          >
          <template v-if="totalsOf(account)">
            <div class="balance-grid account-gap">
              <div class="balance-cell">
                <span class="balance-value">{{ formatTokens(totalsOf(account)!.total) }}</span>
                <span class="balance-label">总 Token</span>
              </div>
              <div class="balance-cell">
                <span class="balance-value">{{ formatTokens(totalsOf(account)!.input) }}</span>
                <span class="balance-label">输入</span>
              </div>
              <div class="balance-cell">
                <span class="balance-value">{{ formatTokens(totalsOf(account)!.output) }}</span>
                <span class="balance-label">输出</span>
              </div>
              <div class="balance-cell">
                <span class="balance-value">{{
                  totalsOf(account)!.requests.toLocaleString('zh-CN')
                }}</span>
                <span class="balance-label">请求数</span>
              </div>
            </div>
            <t-divider />
            <div class="table-scroll">
              <t-table
                :data="rowsOf(account)"
                :columns="columns"
                row-key="_key"
                max-height="360"
                :bordered="true"
              >
                <template #day="{ row }">{{ row.day }}</template>
                <template #inputTokens="{ row }"
                  ><span class="num">{{ formatTokens(row.inputTokens) }}</span></template
                >
                <template #outputTokens="{ row }"
                  ><span class="num">{{ formatTokens(row.outputTokens) }}</span></template
                >
                <template #totalTokens="{ row }"
                  ><span class="num">{{ formatTokens(row.totalTokens) }}</span></template
                >
                <template #requests="{ row }"
                  ><span class="num">{{ row.requests.toLocaleString('zh-CN') }}</span></template
                >
              </t-table>
            </div>
          </template>
        </div>
      </template>
      <t-empty
        v-if="activeAccounts.length === 0"
        description="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
      />
    </template>
  </t-cell-group>
</template>

<style scoped>
.filter-row {
  margin-bottom: 8px;
}

.account-gap {
  margin-top: 12px;
}
</style>
