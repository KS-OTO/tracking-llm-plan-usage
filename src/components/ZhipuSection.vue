<script setup lang="ts">
import type { ZhipuPackagesResponse } from '../types'
import { formatDateTime, formatMoney, formatReset, formatTokens, ratioOf } from '../utils'

defineProps<{
  data: ZhipuPackagesResponse | null
  loading: boolean
  error: string | null
}>()

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
}

function windowStatus(percent: number): 'success' | 'warning' | 'danger' {
  if (percent >= 90) {
    return 'danger'
  }
  if (percent >= 70) {
    return 'warning'
  }
  return 'success'
}

function creditStatusLabel(status: string): string {
  if (status === 'ENABLE') {
    return '已开通'
  }
  if (status === 'NOT_OPEN') {
    return '未开通'
  }
  if (status === 'DISABLE') {
    return '已关闭'
  }
  return status || '—'
}

function packageTypeLabel(type: string): string {
  if (type === 'pay') {
    return '付费'
  }
  if (type === 'give') {
    return '赠送'
  }
  return type || '—'
}

const packageColumns = [
  { colKey: 'name', title: '资源包', width: 180, cell: 'name' },
  { colKey: 'type', title: '类型', width: 60, cell: 'type' },
  { colKey: 'total', title: '总额', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
  { colKey: 'expire', title: '到期时间', width: 140, cell: 'expire' },
]

function packageRows(
  account: NonNullable<ZhipuPackagesResponse['accounts']>[number] & {
    packages?: Array<{
      id: number
      resourcePackageName: string
      suitableScene?: string
      type?: string
      tokensMagnitude: number
      availableBalance: number
      packageExpirationTime?: string
      status?: string
    }>
  },
) {
  return (account.packages ?? [])
    .filter((pkg) => pkg.status === 'EFFECTIVE' || pkg.status === 'NOTUSED')
    .map((pkg) => ({
      ...pkg,
      _key: String(pkg.id),
      _name: pkg.resourcePackageName,
      _scene: pkg.suitableScene ?? '',
    }))
}
</script>

<template>
  <t-cell-group :title="`智谱 GLM（${data?.accounts.length ?? 0} 账号）`" theme="card">
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
              GLM Coding Plan：{{ account.codingPlan?.level || '未知' }}
            </t-tag>
            <a
              class="muted"
              href="https://www.bigmodel.cn/coding-plan/personal/usage"
              target="_blank"
              rel="noreferrer"
            >
              控制台用量页 ↗
            </a>
          </div>

          <div
            v-if="account.codingPlan && account.codingPlan.windows.length > 0"
            class="window-grid"
          >
            <div
              v-for="window in account.codingPlan.windows"
              :key="window.window"
              class="window-card"
            >
              <div class="window-head">
                <span class="window-name">{{ WINDOW_LABELS[window.window] ?? window.window }}</span>
                <span class="window-reset">{{ formatReset(window.nextResetTime) }}</span>
              </div>
              <t-progress
                :percentage="Math.round(Math.min(100, window.percentage))"
                :status="windowStatus(window.percentage)"
                :label="false"
                theme="line"
              />
              <div class="window-meta">
                <span class="num"
                  >{{ formatTokens(window.used) }} / {{ formatTokens(window.total) }}</span
                >
                <span class="num">{{ window.percentage.toFixed(1) }}%</span>
              </div>
              <div class="window-foot">
                剩余 {{ formatTokens(window.remaining) }} · 重置于
                {{ window.nextResetTime > 0 ? formatDateTime(window.nextResetTime) : '—' }}
              </div>
            </div>
          </div>
          <t-empty v-else description="未查询到 Coding Plan 额度（可能未订阅）" />

          <t-divider />
          <div class="balance-grid">
            <div class="balance-cell">
              <span class="balance-value">{{
                formatMoney(account.balance?.availableBalance ?? 0, 'CNY')
              }}</span>
              <span class="balance-label">可用余额</span>
            </div>
            <div class="balance-cell">
              <span class="balance-value">{{
                formatMoney(account.balance?.balance ?? 0, 'CNY')
              }}</span>
              <span class="balance-label">账户余额</span>
            </div>
            <div class="balance-cell">
              <span class="balance-value">{{
                formatMoney(account.balance?.rechargeAmount ?? 0, 'CNY')
              }}</span>
              <span class="balance-label">累计充值</span>
            </div>
            <div class="balance-cell">
              <span class="balance-value">{{
                formatMoney(account.balance?.giveAmount ?? 0, 'CNY')
              }}</span>
              <span class="balance-label">赠送金额</span>
            </div>
            <div class="balance-cell">
              <span class="balance-value">{{
                creditStatusLabel(account.balance?.creditStatus ?? '')
              }}</span>
              <span class="balance-label">信用支付</span>
            </div>
          </div>

          <t-divider />
          <div class="section-title">资源包（{{ packageRows(account).length }}）</div>
          <div class="table-scroll">
            <t-table
              :data="packageRows(account)"
              :columns="packageColumns"
              row-key="_key"
              max-height="360"
              :bordered="true"
            >
              <template #name="{ row }">
                <div>{{ row._name }}</div>
                <div class="muted scene">{{ row._scene }}</div>
              </template>
              <template #type="{ row }">{{ packageTypeLabel(row.type) }}</template>
              <template #total="{ row }"
                ><span class="num">{{ formatTokens(row.tokensMagnitude) }}</span></template
              >
              <template #remaining="{ row }"
                ><span class="num">{{ formatTokens(row.availableBalance) }}</span></template
              >
              <template #expire="{ row }">{{
                row.packageExpirationTime ? row.packageExpirationTime.replace('T', ' ') : '—'
              }}</template>
            </t-table>
          </div>
        </div>
      </template>
      <t-empty v-if="data.accounts.length === 0" description="未配置 ZHIPU_API_KEY" />
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

.scene {
  font-size: 12px;
  max-width: 220px;
  white-space: normal;
}
</style>
