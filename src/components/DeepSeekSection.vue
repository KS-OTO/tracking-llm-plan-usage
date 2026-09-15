<script setup lang="ts">
/**
 * DeepSeek 余额。
 *
 * 卡片只留总余额读数；充值 / 赠金拆分收进「详情」弹窗。
 */
import type { DeepSeekBalanceResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatMoney } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: DeepSeekBalanceResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()
</script>

<template>
  <AccountSection
    title="DeepSeek 余额"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 DEEPSEEK_API_KEY"
  >
    <template v-if="data">
      <t-space direction="vertical" size="medium" class="accounts">
        <div v-for="account in data.accounts" :key="account.keyHint" class="account-group">
          <div class="account-head">
            <span v-if="account.label" class="account-name">{{ account.label }}</span>
            <span class="key-hint" :class="{ 'key-hint-secondary': account.label }">
              {{ account.keyHint }}
            </span>
            <t-tag
              v-if="!isFailedAccount(account)"
              size="small"
              variant="light-outline"
              :theme="account.isAvailable ? 'success' : 'warning'"
            >
              {{ account.isAvailable ? '可用' : '不可用' }}
            </t-tag>
            <DetailDialog
              v-if="!isFailedAccount(account)"
              :title="accountTitle(account)"
              :subtitle="account.label ? account.keyHint : undefined"
            >
              <t-descriptions :column="2" size="small" class="detail-block">
                <t-descriptions-item label="别名">
                  {{ account.label || '未配置（用 DEEPSEEK_LABEL / DEEPSEEK_LABEL_N 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="可用状态">
                  {{ account.isAvailable ? '可用' : '不可用' }}
                </t-descriptions-item>
                <t-descriptions-item
                  v-for="entry in account.balances"
                  :key="`total-${entry.currency}`"
                  :label="`${entry.currency} 总余额`"
                >
                  {{ formatMoney(entry.total, entry.currency) }}
                </t-descriptions-item>
                <t-descriptions-item
                  v-for="entry in account.balances"
                  :key="`topup-${entry.currency}`"
                  :label="`${entry.currency} 充值`"
                >
                  {{ formatMoney(entry.toppedUp, entry.currency) }}
                </t-descriptions-item>
                <t-descriptions-item
                  v-for="entry in account.balances"
                  :key="`granted-${entry.currency}`"
                  :label="`${entry.currency} 赠金`"
                >
                  {{ formatMoney(entry.granted, entry.currency) }}
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
            <t-col v-for="entry in account.balances" :key="entry.currency" :xs="24" :sm="12">
              <t-statistic
                :title="`${entry.currency} 总余额`"
                :value="entry.total"
                :decimal-places="2"
                :suffix="entry.currency"
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
</style>
