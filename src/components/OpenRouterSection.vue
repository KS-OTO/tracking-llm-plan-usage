<script setup lang="ts">
/**
 * OpenRouter。
 *
 * 卡片只留额度读数（剩余额度 / 限额剩余 / 今日用量）；
 * 充值总额、周月用量、密钥元数据（限额重置周期、到期时间、是否管理密钥）收进「详情」弹窗。
 */
import type { OpenRouterDetailResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: OpenRouterDetailResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

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
      <a
        class="muted console-link"
        href="https://openrouter.ai/credits"
        target="_blank"
        rel="noreferrer"
      >
        控制台 ↗
      </a>
    </template>

    <template v-if="data">
      <t-space direction="vertical" size="medium" class="accounts">
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
                  {{ (account.total ?? 0).toFixed(2) }} USD
                </t-descriptions-item>
                <t-descriptions-item label="限额重置">
                  {{ limitResetLabel(account.limitReset) }}
                </t-descriptions-item>
                <t-descriptions-item label="本周用量">
                  {{ account.usageWeekly.toFixed(2) }} USD
                </t-descriptions-item>
                <t-descriptions-item label="本月用量">
                  {{ account.usageMonthly.toFixed(2) }} USD
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

          <t-row v-else :gutter="[16, 16]">
            <t-col :xs="12" :sm="8">
              <t-statistic
                title="剩余额度"
                :value="account.balance"
                :decimal-places="2"
                suffix="USD"
                :color="
                  account.limitRemaining !== null && account.limitRemaining <= 1 ? 'red' : undefined
                "
              />
            </t-col>
            <t-col v-if="account.limit !== null" :xs="12" :sm="8">
              <t-statistic
                title="限额剩余"
                :value="account.limitRemaining ?? 0"
                :decimal-places="2"
                suffix="USD"
              />
            </t-col>
            <t-col :xs="12" :sm="8">
              <t-statistic
                title="今日用量"
                :value="account.usageDaily"
                :decimal-places="2"
                suffix="USD"
              />
            </t-col>
          </t-row>
        </div>
      </t-space>
    </template>
  </AccountSection>
</template>

<style scoped>
.accounts {
  width: 100%;
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

.account-name {
  font-weight: 600;
  font-size: var(--td-font-size-body-large);
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

.detail-block {
  margin-bottom: var(--td-size-4);
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: var(--td-font-size-body-small);
}

.console-link {
  font-size: var(--td-font-size-body-small);
}
</style>
