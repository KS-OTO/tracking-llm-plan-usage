<script setup lang="ts">
import type { DeepSeekBalanceResponse } from '../types'
import { accountName, isFailedAccount } from '../types'
import { formatMoney } from '../utils'

import AccountSection from './AccountSection.vue'

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
        <t-card
          v-for="(account, i) in data.accounts"
          :key="account.keyHint"
          size="small"
          header-bordered
        >
          <template #header>
            <t-space align="center" size="small">
              <t-tag size="small" variant="light-outline" theme="primary">{{
                accountName(account, i)
              }}</t-tag>
              <span class="muted key-hint">{{ account.keyHint }}</span>
              <t-tag
                v-if="!isFailedAccount(account)"
                size="small"
                variant="light-outline"
                :theme="account.isAvailable ? 'success' : 'warning'"
              >
                {{ account.isAvailable ? '可用' : '不可用' }}
              </t-tag>
            </t-space>
          </template>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`账号 ${account.keyHint} 查询失败`"
            :message="account.error"
            :max-line="5"
          />
          <t-row v-else :gutter="[16, 12]">
            <t-col v-for="entry in account.balances" :key="entry.currency" :xs="24" :sm="12">
              <t-statistic
                :title="`${entry.currency} 总余额`"
                :value="entry.total"
                :decimal-places="2"
                :suffix="entry.currency"
              />
              <t-descriptions :column="2" size="small" layout="vertical" class="balance-detail">
                <t-descriptions-item label="充值">
                  {{ formatMoney(entry.toppedUp, entry.currency) }}
                </t-descriptions-item>
                <t-descriptions-item label="赠金">
                  {{ formatMoney(entry.granted, entry.currency) }}
                </t-descriptions-item>
              </t-descriptions>
            </t-col>
          </t-row>
        </t-card>
      </t-space>
    </template>
  </AccountSection>
</template>

<style scoped>
.accounts {
  width: 100%;
}

.balance-detail {
  margin-top: 8px;
}
</style>
