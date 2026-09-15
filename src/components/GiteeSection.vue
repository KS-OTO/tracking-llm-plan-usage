<script setup lang="ts">
/**
 * 模力方舟（Gitee AI）。
 *
 * 卡片只留余额三项读数；资源包明细表与代金券（余额 + 券明细）收进「详情」弹窗。
 */
import type {
  GiteeBalanceResponse,
  GiteeVoucher,
  GiteeVoucherCoupon,
  GiteeVoucherSlice,
} from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatMoney, formatTokens } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: GiteeBalanceResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const columns = [
  { colKey: 'name', title: '资源包', width: 160, cell: 'name' },
  { colKey: 'amount', title: '总金额', align: 'right' as const, cell: 'amount' },
  { colKey: 'balance', title: '余额', align: 'right' as const, cell: 'balance' },
]

const voucherColumns = [
  { colKey: 'catalog', title: '代金券', width: 200, cell: 'catalog' },
  { colKey: 'amount', title: '面额', align: 'right' as const, cell: 'amount' },
  { colKey: 'balance', title: '剩余', align: 'right' as const, cell: 'balance' },
  { colKey: 'expiredAt', title: '过期时间', width: 120, cell: 'expiredAt' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

/** 判别联合守卫：成功分支（含 data）。 */
function voucherOk(slice: GiteeVoucherSlice): slice is { data: GiteeVoucher } {
  return 'data' in slice
}

/** 判别联合守卫：失败分支（含 error）。 */
function voucherFailed(slice: GiteeVoucherSlice): slice is { error: string } {
  return 'error' in slice
}

function voucherStatus(coupon: GiteeVoucherCoupon): {
  theme: 'success' | 'default'
  label: string
} {
  if (coupon.expiredAt > 0 && coupon.expiredAt <= Date.now()) {
    return { theme: 'default', label: '已过期' }
  }
  if (coupon.balance > 0) {
    return { theme: 'success', label: '可用' }
  }
  return { theme: 'default', label: '已用尽' }
}

function formatDate(ms: number): string {
  if (ms <= 0) {
    return '—'
  }
  return new Date(ms).toLocaleDateString('zh-CN')
}
</script>

<template>
  <AccountSection
    title="模力方舟（Gitee AI）"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 GITEE_AI_API_KEY"
  >
    <template v-if="data">
      <div class="stack stack--tight">
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
              <t-divider align="left">资源包明细（{{ account.details.length }}）</t-divider>
              <t-table
                v-if="account.details.length > 0"
                :data="account.details"
                :columns="columns"
                row-key="ident"
                max-height="360"
                size="small"
              >
                <template #name="{ row }">{{ row.name || row.ident || '未命名资源包' }}</template>
                <template #amount="{ row }">{{ formatMoney(row.amount, 'CNY') }}</template>
                <template #balance="{ row }">{{ formatMoney(row.balance, 'CNY') }}</template>
              </t-table>
              <t-empty v-else description="没有资源包" />

              <template v-if="account.voucher">
                <t-divider align="left">
                  <span
                    >代金券（{{
                      voucherOk(account.voucher) ? account.voucher.data.namespace : '—'
                    }}）</span
                  >
                </t-divider>

                <t-alert
                  v-if="voucherFailed(account.voucher)"
                  theme="warning"
                  title="代金券查询失败"
                  :message="account.voucher.error"
                  :max-line="5"
                />
                <template v-else-if="voucherOk(account.voucher)">
                  <div class="grid-metrics detail-block">
                    <t-statistic
                      title="现金代金券余额"
                      :value="account.voucher.data.couponCashBalance"
                      :decimal-places="2"
                      suffix="CNY"
                    />
                    <t-statistic
                      title="算力代金券余额"
                      :value="account.voucher.data.couponComputeBalance"
                      :format="formatTokens"
                    />
                  </div>

                  <t-table
                    v-if="account.voucher.data.coupons.length > 0"
                    :data="account.voucher.data.coupons"
                    :columns="voucherColumns"
                    row-key="id"
                    max-height="300"
                    size="small"
                  >
                    <template #catalog="{ row }">
                      <div>{{ row.catalog }}</div>
                      <div class="muted text-narrow">{{ row.serviceTypes.join(' / ') }}</div>
                    </template>
                    <template #amount="{ row }">{{ formatMoney(row.amount, 'CNY') }}</template>
                    <template #balance="{ row }">{{ formatMoney(row.balance, 'CNY') }}</template>
                    <template #expiredAt="{ row }">{{ formatDate(row.expiredAt) }}</template>
                    <template #status="{ row }">
                      <t-tag size="small" variant="light-outline" :theme="voucherStatus(row).theme">
                        {{ voucherStatus(row).label }}
                      </t-tag>
                    </template>
                  </t-table>
                  <t-empty v-else description="没有代金券" />
                </template>
              </template>
            </DetailDialog>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountTitle(account)} 查询失败`"
            :message="account.error"
            :max-line="5"
          />
          <div v-else class="grid-metrics">
            <t-statistic
              title="剩余余额"
              :value="account.balance"
              :decimal-places="2"
              suffix="CNY"
            />
            <t-statistic
              title="已使用"
              :value="account.usedAmount"
              :decimal-places="2"
              suffix="CNY"
            />
            <t-statistic
              title="总金额"
              :value="account.totalAmount"
              :decimal-places="2"
              suffix="CNY"
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
