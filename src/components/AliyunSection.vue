<script setup lang="ts">
import type { AliyunPackagesResponse } from '../types'

defineProps<{
  data: AliyunPackagesResponse | null
  loading: boolean
  error: string | null
}>()

const columns = [
  { colKey: 'name', title: '资源包', width: 160, cell: 'name' },
  { colKey: 'total', title: '总量', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
  { colKey: 'period', title: '有效期', width: 220, cell: 'period' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

function rowsOf(
  account: NonNullable<AliyunPackagesResponse['accounts']>[number] & {
    packages?: Array<{
      commodityCode?: string
      packageType?: string
      instanceId: string
      totalAmount: string
      totalAmountUnit?: string
      remainingAmount: string
      remainingAmountUnit?: string
      effectiveTime?: string
      expiryTime?: string
      status?: string
      applicableProducts?: string[]
    }>
    totalCount?: number
  },
) {
  return (account.packages ?? []).map((pkg) => ({
    ...pkg,
    _key: pkg.instanceId,
    _name: pkg.commodityCode || pkg.packageType || pkg.instanceId,
  }))
}
</script>

<template>
  <t-cell-group :title="`阿里云百炼 资源包（${data?.accounts.length ?? 0} 账号）`" theme="card">
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
          <div class="table-scroll account-gap">
            <t-table
              :data="rowsOf(account)"
              :columns="columns"
              row-key="_key"
              max-height="360"
              :bordered="true"
            >
              <template #name="{ row }">{{ row._name }}</template>
              <template #total="{ row }">
                <span class="num">{{ row.totalAmount }} {{ row.totalAmountUnit }}</span>
              </template>
              <template #remaining="{ row }">
                <span class="num">{{ row.remainingAmount }} {{ row.remainingAmountUnit }}</span>
              </template>
              <template #period="{ row }">
                <span class="muted">{{ row.effectiveTime }} ~ {{ row.expiryTime }}</span>
              </template>
              <template #status="{ row }">
                <t-tag
                  size="small"
                  variant="light-outline"
                  :theme="row.status === 'Available' ? 'success' : 'warning'"
                >
                  {{ row.status || '—' }}
                </t-tag>
              </template>
            </t-table>
          </div>
          <t-empty v-if="account.totalCount === 0" description="该账号下没有资源包实例" />
        </div>
      </template>
      <t-empty
        v-if="data.accounts.length === 0"
        description="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY"
      />
    </template>
  </t-cell-group>
</template>

<style scoped>
.account-gap {
  margin-top: 12px;
}
</style>
