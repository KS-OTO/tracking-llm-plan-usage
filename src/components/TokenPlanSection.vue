<script setup lang="ts">
import type { TokenPlanResponse } from '../types'
import { isFailedAccount } from '../types'
import { formatTokens } from '../utils'

import AccountSection from './AccountSection.vue'

defineProps<{
  data: TokenPlanResponse | null
  loading: boolean
  error: string | null
}>()

function cycleLabel(start: number, end: number): string {
  if (!start || !end) {
    return '—'
  }
  return `${new Date(start * 1000).toLocaleDateString('zh-CN')} ~ ${new Date(end * 1000).toLocaleDateString('zh-CN')}`
}

const seatColumns = [
  { colKey: 'instance', title: '实例', width: 130, cell: 'instance' },
  { colKey: 'spec', title: '规格', width: 70, cell: 'spec' },
  { colKey: 'cycle', title: '额度周期', width: 200, cell: 'cycle' },
  { colKey: 'total', title: '总额度', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

const packageColumns = [
  { colKey: 'instance', title: '实例', width: 130, cell: 'instance' },
  { colKey: 'cycle', title: '额度周期', width: 200, cell: 'cycle' },
  { colKey: 'total', title: '总额度', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

function seatRows(
  account: NonNullable<TokenPlanResponse['accounts']>[number] & {
    seats?: {
      items?: Array<{
        seatId: string
        instanceCode?: string
        specType?: string
        status?: string
        endTime?: number
        equityList?: Array<{
          equityType?: string
          cycleStartTime?: number
          cycleEndTime?: number
          cycleTotalValue?: number
          cycleSurplusValue?: number
        }>
      }>
      total?: number
    }
  },
) {
  return (account.seats?.items ?? []).map((seat) =>
    Object.assign({}, seat, {
      _key: seat.seatId,
      _cycle: seat.equityList?.[0]
        ? cycleLabel(seat.equityList[0].cycleStartTime ?? 0, seat.equityList[0].cycleEndTime ?? 0)
        : '—',
      _total: seat.equityList?.[0]?.cycleTotalValue ?? 0,
      _remaining: seat.equityList?.[0]?.cycleSurplusValue ?? 0,
    }),
  )
}

function packageRows(
  account: NonNullable<TokenPlanResponse['accounts']>[number] & {
    sharedPackages?: {
      items?: Array<{
        instanceCode: string
        status?: string
        equityList?: Array<{
          cycleStartTime?: number
          cycleEndTime?: number
          cycleTotalValue?: number
          cycleSurplusValue?: number
        }>
      }>
      total?: number
    }
  },
) {
  return (account.sharedPackages?.items ?? []).map((pkg) =>
    Object.assign({}, pkg, {
      _key: pkg.instanceCode,
      _cycle: pkg.equityList?.[0]
        ? cycleLabel(pkg.equityList[0].cycleStartTime ?? 0, pkg.equityList[0].cycleEndTime ?? 0)
        : '—',
      _total: pkg.equityList?.[0]?.cycleTotalValue ?? 0,
      _remaining: pkg.equityList?.[0]?.cycleSurplusValue ?? 0,
    }),
  )
}
</script>

<template>
  <AccountSection
    title="阿里云百炼 Token Plan"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
        <t-card
          v-for="account in data.accounts"
          :key="account.keyHint"
          size="small"
          header-bordered
        >
          <template #header>
            <t-space align="center" size="small" break-line>
              <t-tag size="small" variant="light-outline" theme="primary">
                {{ account.keyHint }}
              </t-tag>
              <template v-if="!isFailedAccount(account)">
                <t-tag size="small" variant="light-outline" theme="warning">
                  {{ account.account?.accountType || 'ALIYUN' }}
                </t-tag>
                <span class="account-name">{{
                  account.account?.name || account.account?.accountId || '—'
                }}</span>
                <span class="muted num">UID {{ account.account?.aliyunUid }}</span>
              </template>
            </t-space>
          </template>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`账号 ${account.keyHint} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <template v-else>
            <t-divider align="left">订阅座席（{{ account.seats?.total ?? 0 }}）</t-divider>
            <t-table
              :data="seatRows(account)"
              :columns="seatColumns"
              row-key="_key"
              max-height="300"
              bordered
              size="small"
            >
              <template #instance="{ row }">
                <span class="muted">{{ row.instanceCode }}</span>
              </template>
              <template #spec="{ row }">{{ row.specType }}</template>
              <template #cycle="{ row }">
                <span class="muted">{{ row._cycle }}</span>
              </template>
              <template #total="{ row }">{{ formatTokens(row._total) }}</template>
              <template #remaining="{ row }">{{ formatTokens(row._remaining) }}</template>
              <template #status="{ row }">
                <t-tag
                  size="small"
                  variant="light-outline"
                  :theme="row.status === 'NORMAL' ? 'success' : 'warning'"
                >
                  {{ row.status || '—' }}
                </t-tag>
              </template>
            </t-table>
            <t-empty v-if="(account.seats?.total ?? 0) === 0" description="没有订阅座席" />

            <t-divider align="left">共享包（{{ account.sharedPackages?.total ?? 0 }}）</t-divider>
            <t-table
              :data="packageRows(account)"
              :columns="packageColumns"
              row-key="_key"
              max-height="300"
              bordered
              size="small"
            >
              <template #instance="{ row }">
                <span class="muted">{{ row.instanceCode }}</span>
              </template>
              <template #cycle="{ row }">
                <span class="muted">{{ row._cycle }}</span>
              </template>
              <template #total="{ row }">{{ formatTokens(row._total) }}</template>
              <template #remaining="{ row }">{{ formatTokens(row._remaining) }}</template>
              <template #status="{ row }">
                <t-tag
                  size="small"
                  variant="light-outline"
                  :theme="row.status === 'NORMAL' ? 'success' : 'warning'"
                >
                  {{ row.status || '—' }}
                </t-tag>
              </template>
            </t-table>
            <t-empty v-if="(account.sharedPackages?.total ?? 0) === 0" description="没有共享包" />
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

.account-name {
  font-weight: 600;
  font-size: 14px;
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
</style>
