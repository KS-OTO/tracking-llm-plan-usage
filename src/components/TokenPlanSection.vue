<script setup lang="ts">
/**
 * 阿里云百炼 Token Plan。
 *
 * 卡片只保留高优先级信息——个人版 5 小时 / 7 天窗口用量与故障提示；
 * 账号身份（类型/名称/UID）、数据来源、订阅元数据（套餐/状态/剩余天数/续费周期）、
 * 加购包、重置卡明细、订阅座席表、共享包表全部收进「详情」弹窗。
 */
import type {
  TokenPlanPersonalPlan,
  TokenPlanResetCard,
  TokenPlanResponse,
  TokenPlanSeat,
  TokenPlanSharedPackage,
} from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatDateTime, formatReset, formatTokens, progressStatus } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: TokenPlanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

/** 个人版用量窗口：5 小时窗口官方取消后不渲染，7 天窗口恒展示。 */
function personalWindows(personal: TokenPlanPersonalPlan): Array<{
  key: string
  label: string
  percent: number
  resetTime: number
}> {
  const windows: Array<{ key: string; label: string; percent: number; resetTime: number }> = []
  if (personal.fiveHour) {
    windows.push({ key: 'fiveHour', label: '5 小时窗口', ...personal.fiveHour })
  }
  windows.push({ key: 'weekly', label: '7 天窗口', ...personal.weekly })
  return windows
}

function cycleLabel(start: number, end: number): string {
  if (!start || !end) {
    return '—'
  }
  return `${new Date(start * 1000).toLocaleDateString('zh-CN')} ~ ${new Date(end * 1000).toLocaleDateString('zh-CN')}`
}

/** 个人版用量的数据来源标签：会话 Cookie（无需授权）/ AK-SK 换取 cliAccessToken。 */
function sourceLabel(plan: TokenPlanPersonalPlan): string {
  return plan.source === 'cookie' ? '会话 Cookie' : 'AK/SK'
}

/** 重置卡汇总：张数 + 最近到期时间（无有效期信息时只给张数）。 */
function resetCardSummary(cards: TokenPlanResetCard[]): string {
  const expiries = cards.map((card) => card.expiresAt).filter((value) => value > 0)
  const earliest = expiries.length > 0 ? Math.min(...expiries) : 0
  return earliest > 0
    ? `${cards.length} 张（最近 ${formatDateTime(earliest)} 到期）`
    : `${cards.length} 张`
}

/** 加购包汇总是否有可展示内容（全零等同于未购买，不渲染空行）。 */
function hasAddonData(plan: TokenPlanPersonalPlan): boolean {
  const addon = plan.addon
  return addon !== null && (addon.totalCredits > 0 || addon.activeCount > 0)
}

const seatColumns = [
  { colKey: 'instance', title: '实例', width: 130, cell: 'instance' },
  { colKey: 'spec', title: '规格', width: 70, cell: 'spec' },
  { colKey: 'cycle', title: '额度周期', width: 200, cell: 'cycle' },
  { colKey: 'total', title: '总额度 (CREDITS)', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余 (CREDITS)', align: 'right' as const, cell: 'remaining' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

const packageColumns = [
  { colKey: 'instance', title: '实例', width: 130, cell: 'instance' },
  { colKey: 'cycle', title: '额度周期', width: 200, cell: 'cycle' },
  { colKey: 'total', title: '总额度 (CREDITS)', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余 (CREDITS)', align: 'right' as const, cell: 'remaining' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

function seatRows(seats: TokenPlanSeat[] | null) {
  return (seats ?? []).map((seat) => {
    const equity = seat.equityList[0]
    return Object.assign({}, seat, {
      _key: seat.seatId,
      _cycle: equity ? cycleLabel(equity.cycleStartTime, equity.cycleEndTime) : '—',
      _total: equity?.cycleTotalValue ?? 0,
      _remaining: equity?.cycleSurplusValue ?? 0,
    })
  })
}

function packageRows(packages: TokenPlanSharedPackage[] | null) {
  return (packages ?? []).map((pkg) => {
    const equity = pkg.equityList[0]
    return Object.assign({}, pkg, {
      _key: pkg.instanceCode,
      _cycle: equity ? cycleLabel(equity.cycleStartTime, equity.cycleEndTime) : '—',
      _total: equity?.cycleTotalValue ?? 0,
      _remaining: equity?.cycleSurplusValue ?? 0,
    })
  })
}
</script>

<template>
  <AccountSection
    title="阿里云百炼 Token Plan"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY 或 ALIYUN_TOKENPLAN_COOKIE"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
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
              <!-- 账号身份：AK/SK 账号有组织信息，Cookie 专属账号只有会话 -->
              <t-descriptions :column="2" size="small" class="detail-block">
                <t-descriptions-item label="别名">
                  {{ account.label || '未配置（用 ALIYUN_LABEL / ALIYUN_TOKENPLAN_LABEL 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
                <template v-if="account.account">
                  <t-descriptions-item label="账号类型">
                    {{ account.account.accountType || 'ALIYUN' }}
                  </t-descriptions-item>
                  <t-descriptions-item label="账号名称">
                    {{ account.account.name || account.account.accountId || '—' }}
                  </t-descriptions-item>
                  <t-descriptions-item label="UID">
                    <span class="num">{{ account.account.aliyunUid }}</span>
                  </t-descriptions-item>
                  <t-descriptions-item label="组织数">
                    {{ account.account.orgs.length }}
                  </t-descriptions-item>
                </template>
                <t-descriptions-item v-else label="凭据">
                  仅配置会话 Cookie（未配置 AK/SK，无组织/座席视图）
                </t-descriptions-item>
              </t-descriptions>

              <!-- 个人版订阅元数据 -->
              <template v-if="'data' in account.personal">
                <t-divider align="left">个人版套餐</t-divider>
                <t-descriptions :column="2" size="small" class="detail-block">
                  <t-descriptions-item label="数据来源">
                    {{ sourceLabel(account.personal.data) }}
                  </t-descriptions-item>
                  <template v-if="account.personal.data.subscription">
                    <t-descriptions-item label="套餐">
                      {{ account.personal.data.subscription.specCode }}
                    </t-descriptions-item>
                    <t-descriptions-item
                      v-if="account.personal.data.subscription.instanceCode"
                      label="实例"
                    >
                      {{ account.personal.data.subscription.instanceCode }}
                    </t-descriptions-item>
                    <t-descriptions-item label="状态">
                      {{ account.personal.data.subscription.status }}
                    </t-descriptions-item>
                    <t-descriptions-item label="剩余天数">
                      {{ account.personal.data.subscription.remainingDays }} 天
                    </t-descriptions-item>
                    <t-descriptions-item label="自动续费">
                      {{ account.personal.data.subscription.autoRenewFlag ? '已开启' : '未开启' }}
                    </t-descriptions-item>
                    <t-descriptions-item label="订阅周期">
                      {{ formatDateTime(account.personal.data.subscription.startTime) }} ~
                      {{ formatDateTime(account.personal.data.subscription.endTime) }}
                    </t-descriptions-item>
                  </template>
                  <t-descriptions-item
                    v-if="account.personal.data.resetCards.length > 0"
                    label="重置卡"
                  >
                    {{ resetCardSummary(account.personal.data.resetCards) }}
                  </t-descriptions-item>
                </t-descriptions>
                <t-descriptions
                  v-if="hasAddonData(account.personal.data)"
                  :column="2"
                  size="small"
                  class="detail-block"
                >
                  <t-descriptions-item label="加购包剩余">
                    {{ formatTokens(account.personal.data.addon?.remainingCredits ?? 0) }} CREDITS
                  </t-descriptions-item>
                  <t-descriptions-item label="加购包总量">
                    {{ formatTokens(account.personal.data.addon?.totalCredits ?? 0) }} CREDITS
                  </t-descriptions-item>
                  <t-descriptions-item label="生效加购包">
                    {{ account.personal.data.addon?.activeCount ?? 0 }} 个
                  </t-descriptions-item>
                </t-descriptions>
              </template>

              <!-- 组织/座席/共享包依赖 AK/SK；仅有会话 Cookie 时整块隐藏 -->
              <template v-if="account.seats || account.sharedPackages">
                <t-divider align="left">订阅座席（{{ account.seats?.total ?? 0 }}）</t-divider>
                <t-table
                  :data="seatRows(account.seats?.items ?? null)"
                  :columns="seatColumns"
                  row-key="_key"
                  max-height="300"
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

                <t-divider align="left">
                  共享包（{{ account.sharedPackages?.total ?? 0 }}）
                </t-divider>
                <t-table
                  :data="packageRows(account.sharedPackages?.items ?? null)"
                  :columns="packageColumns"
                  row-key="_key"
                  max-height="300"
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
                <t-empty
                  v-if="(account.sharedPackages?.total ?? 0) === 0"
                  description="没有共享包"
                />
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

          <template v-else>
            <!-- 个人版用量查询失败属故障信号，留在卡片上；组织/座席视图在弹窗内不受影响 -->
            <t-alert
              v-if="'error' in account.personal"
              theme="warning"
              title="个人版用量查询失败"
              :message="account.personal.error"
              :max-line="4"
            />

            <div class="personal-head">
              <strong>个人版套餐用量</strong>
            </div>
            <t-row v-if="'data' in account.personal" :gutter="[16, 16]">
              <t-col
                v-for="item in personalWindows(account.personal.data)"
                :key="item.key"
                :xs="24"
                :md="12"
              >
                <div class="window-block">
                  <t-space align="center" justify="space-between" class="window-head">
                    <strong>{{ item.label }}</strong>
                    <span class="muted">{{ formatReset(item.resetTime) }}</span>
                  </t-space>
                  <t-progress
                    :percentage="Math.round(Math.min(100, item.percent))"
                    :status="progressStatus(item.percent)"
                    :label="false"
                  />
                  <t-space align="center" justify="space-between" class="window-meta">
                    <span class="muted">已用 {{ item.percent.toFixed(1) }}%</span>
                    <span class="num">{{ item.percent.toFixed(1) }}%</span>
                  </t-space>
                </div>
              </t-col>
            </t-row>
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

.account-name {
  font-weight: 600;
  font-size: var(--td-font-size-body-large);
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.key-hint {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.key-hint-secondary {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
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

.personal-head {
  display: flex;
  align-items: center;
  gap: var(--td-size-2);
  flex-wrap: wrap;
  margin-bottom: var(--td-size-4);
}

.detail-block {
  margin-bottom: var(--td-size-4);
}
</style>
