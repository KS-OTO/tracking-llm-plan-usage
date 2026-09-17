<script setup lang="ts">
/**
 * 「套餐订阅」Tab 的订阅额度区块：**一个平台一张卡**（Kimi For Coding / MiniMax / OpenCode Go）。
 *
 * 这三家都是按窗口计的订阅额度，与火山 Agent Plan、智谱 Coding Plan、百炼 Token Plan 同类，
 * 因此与余额类平台分属不同 Tab、不同接口（`/api/plans`）。
 *
 * 为什么不是「一张订阅套餐卡里塞三组」：卡片标题会退化成「订阅套餐」这种无信息量的分组名，
 * 而同一份数据里明明有平台名（用户实测：配了 2 个 OpenCode Go Key，卡片却写着「订阅套餐」）。
 * 拆成一平台一卡后，标题即平台名，与其余 Tab 的「一平台一卡」完全一致，
 * 也让总览导航卡可以精确跳到某个平台。
 *
 * 卡片只保留高优先级信息：窗口进度条 + 上游异常状态；账号身份与窗口明细收进「详情」弹窗。
 */
import type { PlanAccountUsage, PlanGroup, WindowQuota } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatNumber } from '../format'
import {
  formatDateTime,
  formatReset,
  PLAN_WINDOW_LABELS,
  windowContainerClass,
  windowStatusLabel,
} from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'
import UsageBar from './ui/UsageBar.vue'

defineProps<{
  /** 单个平台的账号分组（App.vue 按平台展开，一个平台一个网格单元）。 */
  group: PlanGroup
}>()

/**
 * 平台专属窗口名：OpenCode Go 的 `monthly` 是 rolling 30 天，叫「每月窗口」会让人
 * 以为按自然月重置；写「30 天窗口」才是它的真实语义。
 */
const PROVIDER_WINDOW_LABELS: Record<string, Record<string, string>> = {
  'OpenCode Go': { monthly: '30 天窗口' },
}

function windowLabelOf(provider: string, window: string): string {
  return PROVIDER_WINDOW_LABELS[provider]?.[window] ?? PLAN_WINDOW_LABELS[window] ?? window
}

/**
 * 平台原始窗口 → 统一模型（`WindowQuota`）。
 *
 * 这一步就是 `#20` 的适配器思路：原始返回形状只出现在适配函数里，
 * 渲染层（`UsageBar`）只认模型。本平台这三种窗口都没有 used/total，
 * 因此数值行会退化成「已用 N%」而不是「已用 X / Y」。
 */
function windowsOf(account: PlanAccountUsage, provider: string): WindowQuota[] {
  return account.windows.map((window) => ({
    key: window.window,
    label: windowLabelOf(provider, window.window),
    used: null,
    total: null,
    remaining: null,
    percent: window.percent,
    resetAt: window.resetTime > 0 ? window.resetTime : null,
    status: window.status,
  }))
}

/** 各平台用量端点（详情弹窗内的「数据来源」，排障时用得上）。 */
const PROVIDER_ENDPOINTS: Record<string, string> = {
  'Kimi For Coding': 'GET api.kimi.com/coding/v1/usages',
  MiniMax: 'GET api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
  'OpenCode Go': 'GET opencode.ai/zen/go/v1/usage',
}

function endpointOf(provider: string): string {
  return PROVIDER_ENDPOINTS[provider] ?? '—'
}

const windowColumns = [
  { colKey: 'window', title: '窗口', width: 110, cell: 'window' },
  { colKey: 'percent', title: '已用', align: 'right' as const, cell: 'percent' },
  { colKey: 'status', title: '上游状态', width: 120, cell: 'status' },
  { colKey: 'reset', title: '重置倒计时', width: 140, cell: 'reset' },
  { colKey: 'resetAt', title: '重置时间', width: 180, cell: 'resetAt' },
]

function windowRows(account: PlanAccountUsage) {
  return account.windows.map((window) => Object.assign({}, window, { _key: window.window }))
}
</script>

<template>
  <AccountSection :title="group.provider" :subtitle="`订阅额度 · ${group.accounts.length} 账号`">
    <div class="grid-cards grid-cards--wide">
      <div v-for="account in group.accounts" :key="account.keyHint" class="account-group">
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
            <t-descriptions :column="1" size="small" class="detail-block">
              <t-descriptions-item label="别名">
                {{ account.label || '未配置（用 *_LABEL / *_LABEL_N 设置）' }}
              </t-descriptions-item>
              <t-descriptions-item label="平台">
                {{ group.provider }}
              </t-descriptions-item>
              <t-descriptions-item label="数据来源">
                <span class="num">{{ endpointOf(group.provider) }}</span>
              </t-descriptions-item>
            </t-descriptions>
            <t-table
              :data="windowRows(account)"
              :columns="windowColumns"
              row-key="_key"
              size="small"
            >
              <template #window="{ row }">
                {{ windowLabelOf(group.provider, row.window) }}
              </template>
              <template #percent="{ row }">
                <span class="num">{{ formatNumber(row.percent) }}%</span>
              </template>
              <template #status="{ row }">
                <t-tag v-if="row.status" size="small" theme="warning" variant="light-outline">
                  {{ windowStatusLabel(row.status) }}
                </t-tag>
                <span v-else class="muted">正常</span>
              </template>
              <template #reset="{ row }">{{ formatReset(row.resetTime) }}</template>
              <template #resetAt="{ row }">
                {{ row.resetTime > 0 ? formatDateTime(row.resetTime) : '—' }}
              </template>
            </t-table>
            <div class="muted detail-hint">{{ account.windows.length }} 个额度窗口</div>
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
          <!-- 容器由**窗口个数**决定（#18）：1–2 个并排、≥3 个纵向等分逐行对齐 -->
          <div
            v-if="account.windows.length > 0"
            :class="windowContainerClass(account.windows.length)"
          >
            <UsageBar
              v-for="window in windowsOf(account, group.provider)"
              :key="window.key"
              :quota="window"
            />
          </div>
          <t-empty v-else description="无额度数据" />
        </template>
      </div>
    </div>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处仅保留本区块特有样式 */
.detail-hint {
  margin-top: var(--td-size-4);
}
</style>
