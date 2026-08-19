<script setup lang="ts">
import type { OpenRouterDetailResponse } from '../types'
import { accountName, isFailedAccount } from '../types'
import { formatMoney } from '../utils'

import AccountSection from './AccountSection.vue'

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
        <div v-for="(account, i) in data.accounts" :key="account.keyHint" class="account-group">
          <div class="account-head">
            <t-space align="center" size="small" break-line>
              <t-tag size="small" variant="light-outline" theme="primary">
                {{ accountName(account, i) }}
              </t-tag>
              <span class="muted key-hint">{{ account.keyHint }}</span>
              <t-tag
                v-if="!isFailedAccount(account)"
                size="small"
                variant="light"
                :theme="account.isFreeTier ? 'default' : 'success'"
              >
                {{ account.isFreeTier ? '免费层' : '付费' }}
              </t-tag>
            </t-space>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountName(account, i)}（${account.keyHint}）查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <template v-else>
            <t-row :gutter="[16, 16]">
              <t-col :xs="12" :sm="8">
                <t-statistic
                  title="剩余额度"
                  :value="account.balance"
                  :decimal-places="2"
                  suffix="USD"
                  :color="
                    account.limitRemaining !== null && account.limitRemaining <= 1
                      ? 'red'
                      : undefined
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
                  title="总充值 / 已用"
                  :value="account.total ?? 0"
                  :decimal-places="2"
                  suffix="USD"
                />
              </t-col>
            </t-row>

            <t-row :gutter="[16, 16]">
              <t-col :xs="12" :sm="8">
                <t-statistic
                  title="今日用量"
                  :value="account.usageDaily"
                  :decimal-places="2"
                  suffix="USD"
                />
              </t-col>
              <t-col :xs="12" :sm="8">
                <t-statistic
                  title="本周用量"
                  :value="account.usageWeekly"
                  :decimal-places="2"
                  suffix="USD"
                />
              </t-col>
              <t-col :xs="12" :sm="8">
                <t-statistic
                  title="本月用量"
                  :value="account.usageMonthly"
                  :decimal-places="2"
                  suffix="USD"
                />
              </t-col>
            </t-row>

            <t-space size="small" break-line class="meta-row">
              <t-tag v-if="account.limitReset" size="small" variant="light-outline" theme="primary">
                限额 {{ limitResetLabel(account.limitReset) }}
              </t-tag>
              <t-tag size="small" variant="light-outline" theme="default">
                Key {{ expiryLabel(account.expiresAt) }}
              </t-tag>
              <t-tag
                v-if="account.isManagementKey"
                size="small"
                variant="light-outline"
                theme="warning"
              >
                管理密钥
              </t-tag>
            </t-space>
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

.muted {
  color: var(--td-text-color-placeholder);
  font-size: var(--td-font-size-body-small);
}

.key-hint {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-placeholder);
}

.console-link {
  font-size: var(--td-font-size-body-small);
}

.meta-row {
  margin-top: var(--td-size-4);
}
</style>
