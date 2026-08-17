<script setup lang="ts">
import type { ExtrasResponse } from '../types'
import { isFailedAccount } from '../types'
import { formatDateTime, formatMoney, formatReset, progressStatus } from '../utils'

import AccountSection from './AccountSection.vue'

defineProps<{
  data: ExtrasResponse | null
  loading: boolean
  error: string | null
}>()

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
}
</script>

<template>
  <AccountSection
    title="其他平台（扩展）"
    :subtitle="`${data?.configured ?? 0} 凭据`"
    :loading="loading"
    :error="error"
    :empty="data?.configured === 0"
    empty-text="未配置扩展平台密钥（STEPFUN / SILICONFLOW / OPENROUTER / NOVITA / KIMI / MINIMAX）"
  >
    <template v-if="data">
      <t-space direction="vertical" size="large" class="accounts">
        <template v-for="group in data.balances" :key="group.provider">
          <div class="group-head">
            <strong>{{ group.provider }}</strong>
            <span class="muted">账户余额 · {{ group.accounts.length }} 账号</span>
          </div>
          <t-row :gutter="[12, 12]">
            <t-col
              v-for="account in group.accounts"
              :key="account.keyHint"
              :xs="24"
              :sm="12"
              :lg="8"
            >
              <t-card size="small" header-bordered>
                <template #header>
                  <t-tag size="small" variant="light-outline" theme="primary">
                    {{ account.keyHint }}
                  </t-tag>
                </template>
                <t-alert
                  v-if="isFailedAccount(account)"
                  theme="error"
                  :title="`账号 ${account.keyHint} 查询失败`"
                  :message="account.error"
                  :max-line="5"
                />
                <template v-else>
                  <t-statistic
                    title="余额"
                    :value="account.balance"
                    :decimal-places="2"
                    :suffix="account.unit"
                  />
                  <t-descriptions
                    v-if="account.total !== undefined"
                    :column="1"
                    size="small"
                    layout="vertical"
                    class="extra-detail"
                  >
                    <t-descriptions-item label="总额">
                      {{ formatMoney(account.total, account.unit) }}
                    </t-descriptions-item>
                    <t-descriptions-item label="已用">
                      {{ formatMoney(account.used ?? 0, account.unit) }}
                    </t-descriptions-item>
                  </t-descriptions>
                  <div v-if="account.note" class="muted extra-note">{{ account.note }}</div>
                </template>
              </t-card>
            </t-col>
          </t-row>
        </template>

        <template v-for="group in data.plans" :key="group.provider">
          <t-divider align="left">
            <t-space align="center" size="small">
              <strong>{{ group.provider }}</strong>
              <span class="muted">Token Plan · {{ group.accounts.length }} 账号</span>
            </t-space>
          </t-divider>
          <t-row :gutter="[12, 12]">
            <t-col
              v-for="account in group.accounts"
              :key="account.keyHint"
              :xs="24"
              :sm="12"
              :lg="8"
            >
              <t-card size="small" header-bordered>
                <template #header>
                  <t-tag size="small" variant="light-outline" theme="primary">
                    {{ account.keyHint }}
                  </t-tag>
                </template>
                <t-alert
                  v-if="isFailedAccount(account)"
                  theme="error"
                  :title="`账号 ${account.keyHint} 查询失败`"
                  :message="account.error"
                  :max-line="5"
                />
                <template v-else>
                  <t-row v-if="account.windows.length > 0" :gutter="[12, 12]">
                    <t-col v-for="window in account.windows" :key="window.window" :xs="24">
                      <div class="window-block">
                        <t-space align="center" justify="space-between" class="window-head">
                          <strong>{{ WINDOW_LABELS[window.window] ?? window.window }}</strong>
                          <span class="muted">{{ formatReset(window.resetTime) }}</span>
                        </t-space>
                        <t-progress
                          :percentage="Math.round(Math.min(100, window.percent))"
                          :status="progressStatus(window.percent)"
                          :label="false"
                        />
                        <t-space align="center" justify="space-between" class="window-meta">
                          <span class="muted">已用 {{ window.percent.toFixed(1) }}%</span>
                          <span class="num">{{ window.percent.toFixed(1) }}%</span>
                        </t-space>
                        <div v-if="window.resetTime > 0" class="muted window-foot">
                          重置于 {{ formatDateTime(window.resetTime) }}
                        </div>
                      </div>
                    </t-col>
                  </t-row>
                  <t-empty v-else description="无额度数据" />
                </template>
              </t-card>
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

.window-block {
  padding: 12px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
}

.window-head {
  margin-bottom: 8px;
}

.window-meta {
  margin-top: 8px;
}

.num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.muted {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.window-foot {
  margin-top: 4px;
}

.extra-detail {
  margin-top: 8px;
}

.extra-note {
  margin-top: 8px;
}
</style>
