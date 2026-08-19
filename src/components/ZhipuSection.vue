<script setup lang="ts">
import { computed } from 'vue'
import type { ZhipuPackagesResponse } from '../types'
import { accountName, isFailedAccount } from '../types'
import { formatDateTime, formatReset, formatTokens, progressStatus } from '../utils'

import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: ZhipuPackagesResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
  /** 卡片变体：plan = Coding Plan 额度（套餐订阅 Tab）；balance = 余额/资源包（余额账户 Tab）。 */
  variant?: 'plan' | 'balance'
}>()

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
}

/** 信用支付状态 → 数值占位（t-statistic 值必须为 number，文本经 format 呈现）。 */
function creditStatusNumber(status: string): number {
  return status === 'ENABLE' ? 1 : 0
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

function packageRowsOf(
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
    .map((pkg) =>
      Object.assign({}, pkg, {
        _key: String(pkg.id),
        _name: pkg.resourcePackageName,
        _scene: pkg.suitableScene ?? '',
      }),
    )
}

/** 每账号资源包行一次性计算（divider 计数与表格数据共用，避免每次渲染重复过滤/映射）。 */
const packageRowsByHint = computed(() => {
  const map = new Map<string, ReturnType<typeof packageRowsOf>>()
  for (const account of props.data?.accounts ?? []) {
    if (!isFailedAccount(account)) {
      map.set(account.keyHint, packageRowsOf(account))
    }
  }
  return map
})
</script>

<template>
  <AccountSection
    :title="variant === 'balance' ? '智谱 GLM 余额' : '智谱 GLM Coding Plan'"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 ZHIPU_API_KEY"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
        <div v-for="(account, i) in data.accounts" :key="account.keyHint" class="account-group">
          <div class="account-head">
            <t-space align="center" size="small" break-line>
              <t-tag size="small" variant="light-outline" theme="primary">{{
                accountName(account, i)
              }}</t-tag>
              <span class="muted key-hint">{{ account.keyHint }}</span>
              <t-tag
                v-if="variant !== 'balance' && !isFailedAccount(account)"
                size="small"
                variant="light-outline"
                theme="warning"
              >
                GLM Coding Plan：{{ account.codingPlan?.level || '未知' }}
              </t-tag>
            </t-space>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`账号 ${account.keyHint} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <template v-else>
            <t-space
              v-if="variant !== 'balance'"
              align="center"
              size="small"
              break-line
              class="account-head"
            >
              <a
                class="muted"
                href="https://www.bigmodel.cn/coding-plan/personal/usage"
                target="_blank"
                rel="noreferrer"
              >
                控制台用量页 ↗
              </a>
            </t-space>

            <t-row
              v-if="
                variant !== 'balance' && account.codingPlan && account.codingPlan.windows.length > 0
              "
              :gutter="[16, 16]"
            >
              <t-col
                v-for="window in account.codingPlan.windows"
                :key="window.window"
                :xs="24"
                :sm="12"
              >
                <div class="window-block">
                  <t-space align="center" justify="space-between" class="window-head">
                    <strong>{{ WINDOW_LABELS[window.window] ?? window.window }}</strong>
                    <span class="muted">{{ formatReset(window.nextResetTime) }}</span>
                  </t-space>
                  <t-progress
                    :percentage="Math.round(Math.min(100, window.percentage))"
                    :status="progressStatus(window.percentage)"
                    :label="false"
                  />
                  <t-space align="center" justify="space-between" class="window-meta">
                    <span class="num"
                      >{{ formatTokens(window.used) }} / {{ formatTokens(window.total) }}</span
                    >
                    <span class="num">{{ window.percentage.toFixed(1) }}%</span>
                  </t-space>
                  <div class="muted window-foot">
                    剩余 {{ formatTokens(window.remaining) }} · 重置于
                    {{ window.nextResetTime > 0 ? formatDateTime(window.nextResetTime) : '—' }}
                  </div>
                </div>
              </t-col>
            </t-row>
            <t-empty
              v-else-if="variant !== 'balance'"
              description="未查询到 Coding Plan 额度（可能未订阅）"
            />

            <t-divider v-if="variant !== 'plan'" align="left">余额</t-divider>
            <t-row v-if="variant !== 'plan'" :gutter="[16, 16]">
              <t-col :xs="12" :sm="8" :lg="4">
                <t-statistic
                  title="可用余额"
                  :value="account.balance?.availableBalance ?? 0"
                  :decimal-places="2"
                  suffix="CNY"
                />
              </t-col>
              <t-col :xs="12" :sm="8" :lg="4">
                <t-statistic
                  title="账户余额"
                  :value="account.balance?.balance ?? 0"
                  :decimal-places="2"
                  suffix="CNY"
                />
              </t-col>
              <t-col :xs="12" :sm="8" :lg="4">
                <t-statistic
                  title="累计充值"
                  :value="account.balance?.rechargeAmount ?? 0"
                  :decimal-places="2"
                  suffix="CNY"
                />
              </t-col>
              <t-col :xs="12" :sm="8" :lg="4">
                <t-statistic
                  title="赠送金额"
                  :value="account.balance?.giveAmount ?? 0"
                  :decimal-places="2"
                  suffix="CNY"
                />
              </t-col>
              <t-col :xs="12" :sm="8" :lg="4">
                <t-statistic
                  title="信用支付"
                  :value="creditStatusNumber(account.balance?.creditStatus ?? '')"
                  :format="() => creditStatusLabel(account.balance?.creditStatus ?? '')"
                />
              </t-col>
            </t-row>

            <t-divider v-if="variant !== 'plan'" align="left"
              >资源包（{{ packageRowsByHint.get(account.keyHint)?.length ?? 0 }}）</t-divider
            >
            <t-table
              v-if="variant !== 'plan'"
              :data="packageRowsByHint.get(account.keyHint) ?? []"
              :columns="packageColumns"
              row-key="_key"
              max-height="360"
              size="small"
            >
              <template #name="{ row }">
                <div>{{ row._name }}</div>
                <div class="muted scene">{{ row._scene }}</div>
              </template>
              <template #type="{ row }">{{ packageTypeLabel(row.type) }}</template>
              <template #total="{ row }">{{ formatTokens(row.tokensMagnitude) }}</template>
              <template #remaining="{ row }">{{ formatTokens(row.availableBalance) }}</template>
              <template #expire="{ row }">{{
                row.packageExpirationTime ? row.packageExpirationTime.replace('T', ' ') : '—'
              }}</template>
            </t-table>
          </template>
        </div>
      </t-space>
    </template>
  </AccountSection>
</template>

<style scoped>
.accounts {
  width: 100%;
}

.account-head {
  margin-bottom: 12px;
}

.window-block {
  padding: var(--td-size-5) var(--td-size-6);
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}

.window-head {
  margin-bottom: 8px;
}

.window-meta {
  margin-top: 8px;
}

.num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.window-foot {
  margin-top: 4px;
}

.scene {
  max-width: 220px;
  white-space: normal;
}

.account-group {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  padding: var(--td-size-5) var(--td-size-6);
}

.account-head {
  display: flex;
  align-items: center;
  gap: var(--td-size-2);
  flex-wrap: wrap;
  margin-bottom: var(--td-size-4);
}
</style>
