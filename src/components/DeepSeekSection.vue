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
      <div class="grid-cards grid-cards--wide">
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
          <div v-else class="grid-metrics">
            <t-statistic
              v-for="entry in account.balances"
              :key="entry.currency"
              :title="`${entry.currency} 总余额`"
              :value="entry.total"
              :decimal-places="2"
              :suffix="entry.currency"
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
