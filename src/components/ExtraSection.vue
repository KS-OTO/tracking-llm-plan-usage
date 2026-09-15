<script setup lang="ts">
/**
 * 扩展平台 —— 余额类（余额账户 Tab）：StepFun / SiliconFlow / OpenRouter / Novita。
 *
 * 套餐类扩展平台（Kimi / MiniMax / OpenCode Go）已随 `/api/plans` 归入「套餐订阅」Tab，
 * 不再出现在这里。
 *
 * 卡片只留「余额」这一个高优先级读数；总额/已用/备注属于基本信息，收进「详情」弹窗。
 */
import type { ExtrasResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatMoney } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: ExtrasResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()
</script>

<template>
  <AccountSection
    title="其他平台（扩展）"
    :subtitle="`${data?.configured ?? 0} 凭据`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.configured === 0"
    empty-text="未配置扩展平台密钥（STEPFUN / SILICONFLOW / OPENROUTER / NOVITA）"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
        <template v-for="group in data.balances" :key="group.provider">
          <div class="group-head">
            <strong>{{ group.provider }}</strong>
            <span class="muted">账户余额 · {{ group.accounts.length }} 账号</span>
          </div>
          <t-row :gutter="[16, 16]">
            <t-col
              v-for="account in group.accounts"
              :key="account.keyHint"
              :xs="24"
              :sm="12"
              :lg="8"
            >
              <div class="account-group">
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
                    <t-descriptions :column="1" size="small" class="detail-meta">
                      <t-descriptions-item label="别名">
                        {{ account.label || '未配置（用 *_LABEL / *_LABEL_N 设置）' }}
                      </t-descriptions-item>
                      <t-descriptions-item label="平台">
                        {{ group.provider }}
                      </t-descriptions-item>
                      <t-descriptions-item v-if="account.total !== undefined" label="总额">
                        {{ formatMoney(account.total, account.unit) }}
                      </t-descriptions-item>
                      <t-descriptions-item v-if="account.total !== undefined" label="已用">
                        {{ formatMoney(account.used ?? 0, account.unit) }}
                      </t-descriptions-item>
                      <t-descriptions-item v-if="account.note" label="备注">
                        {{ account.note }}
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
                <t-statistic
                  v-else
                  title="余额"
                  :value="account.balance"
                  :decimal-places="2"
                  :suffix="account.unit"
                />
              </div>
            </t-col>
          </t-row>
        </template>
      </t-space>
    </template>
  </AccountSection>
</template>

<style scoped>
.accounts {
  width: 100%;
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
}

.account-group {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  padding: var(--td-size-5) var(--td-size-6);
  height: 100%;
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

.detail-meta {
  margin-bottom: var(--td-size-4);
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
</style>
