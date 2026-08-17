<script setup lang="ts">
import type { AliyunPackagesResponse } from '../types'
import { isFailedAccount } from '../types'

import AccountSection from './AccountSection.vue'

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
  return (account.packages ?? []).map((pkg) =>
    Object.assign({}, pkg, {
      _key: pkg.instanceId,
      _name: pkg.commodityCode || pkg.packageType || pkg.instanceId,
    }),
  )
}
</script>

<template>
  <AccountSection
    title="阿里云百炼 资源包"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY"
  >
    <template v-if="data">
      <t-space direction="vertical" size="medium" class="accounts">
        <t-card
          v-for="account in data.accounts"
          :key="account.keyHint"
          size="small"
          header-bordered
        >
          <template #header>
            <t-tag size="small" variant="light-outline" theme="primary">
              {{ account.keyHint }}
            </t-tag>
          </template>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`账号 ${account.keyHint} 查询失败`"
            :message="account.error"
            :max-line="5"
          />
          <template v-else>
            <t-table
              :data="rowsOf(account)"
              :columns="columns"
              row-key="_key"
              max-height="360"
              bordered
              size="small"
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
            <t-empty v-if="account.totalCount === 0" description="该账号下没有资源包实例" />
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

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
</style>
