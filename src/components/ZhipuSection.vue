<script setup lang="ts">
/**
 * 智谱 GLM。
 *
 * - plan 变体（套餐订阅 Tab）：卡片只留 Coding Plan 窗口额度；等级、控制台入口、
 *   账户余额与资源包明细收进「详情」弹窗。
 * - balance 变体（余额账户 Tab）：卡片留余额读数；资源包明细表收进「详情」弹窗。
 */
import { computed } from 'vue'
import type { ZhipuPackagesResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatDateTime, formatReset, formatTokens, progressStatus } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

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

/** 别名提示：不同变体对应不同 Tab，提示保持同一份即可（前缀相同）。 */
const ALIAS_HINT = '未配置（用 ZHIPU_LABEL / ZHIPU_LABEL_N 设置）'

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
                  {{ account.label || ALIAS_HINT }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="Coding Plan 等级">
                  {{ account.codingPlan?.level || '未查询到（可能未订阅）' }}
                </t-descriptions-item>
                <t-descriptions-item label="控制台用量页">
                  <a
                    href="https://www.bigmodel.cn/coding-plan/personal/usage"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 ↗
                  </a>
                </t-descriptions-item>
                <!-- 余额账户变体：次级金额指标已从卡片移到这里，避免卡片堆满数字 -->
                <template v-if="variant === 'balance'">
                  <t-descriptions-item label="信用支付">
                    {{ creditStatusLabel(account.balance?.creditStatus ?? '') }}
                  </t-descriptions-item>
                  <t-descriptions-item label="累计充值">
                    {{ (account.balance?.rechargeAmount ?? 0).toFixed(2) }} CNY
                  </t-descriptions-item>
                  <t-descriptions-item label="赠送金额">
                    {{ (account.balance?.giveAmount ?? 0).toFixed(2) }} CNY
                  </t-descriptions-item>
                </template>
              </t-descriptions>

              <t-divider align="left">
                资源包（{{ packageRowsByHint.get(account.keyHint)?.length ?? 0 }}）
              </t-divider>
              <t-table
                :data="packageRowsByHint.get(account.keyHint) ?? []"
                :columns="packageColumns"
                row-key="_key"
                max-height="360"
                size="small"
              >
                <template #name="{ row }">
                  <div>{{ row._name }}</div>
                  <div class="muted text-narrow">{{ row._scene }}</div>
                </template>
                <template #type="{ row }">{{ packageTypeLabel(row.type) }}</template>
                <template #total="{ row }">{{ formatTokens(row.tokensMagnitude) }}</template>
                <template #remaining="{ row }">{{ formatTokens(row.availableBalance) }}</template>
                <template #expire="{ row }">{{
                  row.packageExpirationTime ? row.packageExpirationTime.replace('T', ' ') : '—'
                }}</template>
              </t-table>
              <t-empty
                v-if="(packageRowsByHint.get(account.keyHint)?.length ?? 0) === 0"
                description="没有生效中的资源包"
              />
            </DetailDialog>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountTitle(account)} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <template v-else>
            <div
              v-if="
                variant !== 'balance' && account.codingPlan && account.codingPlan.windows.length > 0
              "
              class="grid-metrics"
            >
              <div
                v-for="window in account.codingPlan.windows"
                :key="window.window"
                class="window-block"
              >
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
                  <span class="num-strong"
                    >{{ formatTokens(window.used) }} / {{ formatTokens(window.total) }}</span
                  >
                  <span class="num-strong">{{ window.percentage.toFixed(1) }}%</span>
                </t-space>
                <div class="muted window-foot">
                  剩余 {{ formatTokens(window.remaining) }} · 重置于
                  {{ window.nextResetTime > 0 ? formatDateTime(window.nextResetTime) : '—' }}
                </div>
              </div>
            </div>
            <t-empty
              v-else-if="variant !== 'balance'"
              description="未查询到 Coding Plan 额度（可能未订阅）"
            />

            <div v-if="variant !== 'plan'" class="grid-metrics grid-metrics--pair">
              <t-statistic
                title="可用余额"
                :value="account.balance?.availableBalance ?? 0"
                :decimal-places="2"
                unit="CNY"
              />
              <t-statistic
                title="账户余额"
                :value="account.balance?.balance ?? 0"
                :decimal-places="2"
                unit="CNY"
              />
            </div>
          </template>
        </div>
      </div>
    </template>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处无区块特有样式 */
</style>
