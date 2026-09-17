<script setup lang="ts">
/**
 * OpenRouter。
 *
 * 卡片只留额度读数（剩余额度 / 限额剩余 / 今日用量）；
 * 充值总额、周月用量、密钥元数据（限额重置周期、到期时间、是否管理密钥）收进「详情」弹窗。
 */
import type { OpenRouterDetailResponse } from '../types'
import { currencySymbol, formatCurrency, truncateMoney } from '../format'
import { metricGridClass } from '../utils'
import { accountTitle, isFailedAccount } from '../types'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: OpenRouterDetailResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

/**
 * OpenRouter 的读数一律 USD，卡面按统一规则只显示**符号**（#19）。
 * 取符号走 `currencySymbol()`，不在这里写死 `'$'` —— 映射只维护一份。
 */
const UNIT = currencySymbol('USD')

function limitResetLabel(reset: string | null): string {
  if (!reset) {
    return '—'
  }
  const labels: Record<string, string> = {
    monthly: '每月重置',
    weekly: '每周重置',
    daily: '每日重置',
  }
  return labels[reset] ?? reset
}

function expiryLabel(iso: string | null): string {
  if (!iso) {
    return '永久有效'
  }
  return iso.replace('T', ' ').replace(/Z$/, '')
}
</script>

<template>
  <AccountSection
    title="OpenRouter"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 OPENROUTER_API_KEY"
  >
    <template #actions>
      <a class="muted" href="https://openrouter.ai/credits" target="_blank" rel="noreferrer">
        控制台 ↗
      </a>
    </template>

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
                <t-descriptions-item label="别名 / 密钥名">
                  {{ account.label || '未配置（用 OPENROUTER_LABEL / OPENROUTER_LABEL_N 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="账户类型">
                  {{ account.isFreeTier ? '免费层' : '付费' }}
                </t-descriptions-item>
                <t-descriptions-item label="管理密钥">
                  {{ account.isManagementKey ? '是' : '否' }}
                </t-descriptions-item>
                <t-descriptions-item label="充值 / 已用">
                  {{ formatCurrency(account.total ?? 0, 'USD') }}
                </t-descriptions-item>
                <t-descriptions-item label="限额重置">
                  {{ limitResetLabel(account.limitReset) }}
                </t-descriptions-item>
                <t-descriptions-item label="本周用量">
                  {{ formatCurrency(account.usageWeekly, 'USD') }}
                </t-descriptions-item>
                <t-descriptions-item label="本月用量">
                  {{ formatCurrency(account.usageMonthly, 'USD') }}
                </t-descriptions-item>
                <t-descriptions-item label="Key 有效期">
                  {{ expiryLabel(account.expiresAt) }}
                </t-descriptions-item>
              </t-descriptions>
            </DetailDialog>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountTitle(account)} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <div v-else :class="metricGridClass(account.limit !== null ? 3 : 2)">
            <t-statistic
              title="剩余额度"
              :value="truncateMoney(account.balance)"
              :decimal-places="2"
              :unit="UNIT"
              :color="
                account.limitRemaining !== null && account.limitRemaining <= 1 ? 'red' : undefined
              "
            />
            <t-statistic
              v-if="account.limit !== null"
              title="限额剩余"
              :value="truncateMoney(account.limitRemaining ?? 0)"
              :decimal-places="2"
              :unit="UNIT"
            />
            <t-statistic
              title="今日用量"
              :value="truncateMoney(account.usageDaily)"
              :decimal-places="2"
              :unit="UNIT"
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
