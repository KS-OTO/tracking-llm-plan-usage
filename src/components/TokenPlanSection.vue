<script setup lang="ts">
import type { TokenPlanResponse } from '../types'
import { formatDateTime, formatTokens } from '../utils'

defineProps<{
  data: TokenPlanResponse | null
  loading: boolean
  error: string | null
}>()

const seatColumns = [
  { colKey: 'instance', title: '实例', width: 130, cell: 'instance' },
  { colKey: 'spec', title: '规格', width: 70, cell: 'spec' },
  { colKey: 'cycle', title: '额度周期', width: 150, cell: 'cycle' },
  { colKey: 'total', title: '总额度', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

function cycleLabel(start: number, end: number): string {
  if (!start || !end) {
    return '—'
  }
  return `${new Date(start * 1000).toLocaleDateString('zh-CN')} ~ ${new Date(end * 1000).toLocaleDateString('zh-CN')}`
}

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
  return (account.seats?.items ?? []).map((seat) => ({
    ...seat,
    _key: seat.seatId,
    _cycle: seat.equityList?.[0]
      ? cycleLabel(seat.equityList[0].cycleStartTime ?? 0, seat.equityList[0].cycleEndTime ?? 0)
      : '—',
    _total: seat.equityList?.[0]?.cycleTotalValue ?? 0,
    _remaining: seat.equityList?.[0]?.cycleSurplusValue ?? 0,
  }))
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
  return (account.sharedPackages?.items ?? []).map((pkg) => ({
    ...pkg,
    _key: pkg.instanceCode,
    _cycle: pkg.equityList?.[0]
      ? cycleLabel(pkg.equityList[0].cycleStartTime ?? 0, pkg.equityList[0].cycleEndTime ?? 0)
      : '—',
    _total: pkg.equityList?.[0]?.cycleTotalValue ?? 0,
    _remaining: pkg.equityList?.[0]?.cycleSurplusValue ?? 0,
  }))
}
</script>

<template>
  <t-cell-group :title="`阿里云百炼 Token Plan（${data?.accounts.length ?? 0} 账号）`" theme="card">
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
            <t-tag size="small" variant="light-outline" theme="warning">
              {{ account.account?.accountType || 'ALIYUN' }}
            </t-tag>
            <span class="account-name">{{
              account.account?.name || account.account?.accountId || '—'
            }}</span>
            <span class="muted num">UID {{ account.account?.aliyunUid }}</span>
          </div>

          <div class="section-title">订阅座席（{{ account.seats?.total ?? 0 }}）</div>
          <div class="table-scroll">
            <t-table
              :data="seatRows(account)"
              :columns="seatColumns"
              row-key="_key"
              max-height="300"
              :bordered="true"
            >
              <template #instance="{ row }"
                ><span class="muted">{{ row.instanceCode }}</span></template
              >
              <template #spec="{ row }">{{ row.specType }}</template>
              <template #cycle="{ row }"
                ><span class="muted">{{ row._cycle }}</span></template
              >
              <template #total="{ row }"
                ><span class="num">{{ formatTokens(row._total) }}</span></template
              >
              <template #remaining="{ row }"
                ><span class="num">{{ formatTokens(row._remaining) }}</span></template
              >
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
          </div>
          <t-empty v-if="(account.seats?.total ?? 0) === 0" description="没有订阅座席" />

          <t-divider />
          <div class="section-title">共享包（{{ account.sharedPackages?.total ?? 0 }}）</div>
          <div class="table-scroll">
            <t-table
              :data="packageRows(account)"
              :columns="[
                { colKey: 'instance', title: '实例', width: 130, cell: 'instance' },
                { colKey: 'cycle', title: '额度周期', width: 150, cell: 'cycle' },
                { colKey: 'total', title: '总额度', align: 'right' as const, cell: 'total' },
                { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
                { colKey: 'status', title: '状态', width: 90, cell: 'status' },
              ]"
              row-key="_key"
              max-height="300"
              :bordered="true"
            >
              <template #instance="{ row }"
                ><span class="muted">{{ row.instanceCode }}</span></template
              >
              <template #cycle="{ row }"
                ><span class="muted">{{ row._cycle }}</span></template
              >
              <template #total="{ row }"
                ><span class="num">{{ formatTokens(row._total) }}</span></template
              >
              <template #remaining="{ row }"
                ><span class="num">{{ formatTokens(row._remaining) }}</span></template
              >
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
          </div>
          <t-empty v-if="(account.sharedPackages?.total ?? 0) === 0" description="没有共享包" />
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
.account-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.account-name {
  font-weight: 600;
  font-size: 14px;
}
</style>
