<script setup lang="ts">
/**
 * 阿里云百炼 Token 资源包（费用中心 BSS）。
 *
 * 卡片只留实例计数读数；资源包明细表（总量/剩余/有效期/状态）收进「详情」弹窗。
 */
import type { AliyunPackagesResponse } from '../types'
import { roundCount } from '../format'
import { accountTitle, isFailedAccount } from '../types'
import { metricGridClass } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: AliyunPackagesResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
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

/** 可用（未过期未用尽）实例数：状态判定与表格里的 tag 保持一致。 */
function availableCount(account: NonNullable<AliyunPackagesResponse['accounts']>[number]): number {
  if (isFailedAccount(account)) {
    return 0
  }
  return rowsOf(account).filter((row) => row.status === 'Available').length
}
</script>

<template>
  <AccountSection
    title="阿里云百炼 资源包"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY"
  >
    <template v-if="data">
      <div class="grid-cards grid-cards--wide">
        <div v-for="account in data.accounts" :key="account.keyHint" class="account-group">
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
              <t-descriptions :column="2" size="small" class="detail-block">
                <t-descriptions-item label="别名">
                  {{ account.label || '未配置（用 ALIYUN_LABEL / ALIYUN_LABEL_N 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
              </t-descriptions>
              <t-table
                :data="rowsOf(account)"
                :columns="columns"
                row-key="_key"
                max-height="360"
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
            </DetailDialog>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountTitle(account)} 查询失败`"
            :message="account.error"
            :max-line="5"
          />
          <div v-else :class="metricGridClass(2)">
            <t-statistic
              title="资源包实例"
              :value="roundCount(account.totalCount ?? 0)"
              :decimal-places="0"
            />
            <t-statistic
              title="可用实例"
              :value="roundCount(availableCount(account))"
              :decimal-places="0"
            />
          </div>
        </div>
      </div>
    </template>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处无区块特有样式 */
</style>
