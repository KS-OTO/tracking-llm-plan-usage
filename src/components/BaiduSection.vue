<script setup lang="ts">
/**
 * 百度智能云千帆。
 *
 * 卡片只留近 7 天用量三项读数；量包明细与 TPM 配额表收进「详情」弹窗。
 */
import type { BaiduQianfanResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { metricGridClass } from '../utils'
import { formatCount, formatTokens } from '../format'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

defineProps<{
  data: BaiduQianfanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const packageColumns = [
  { colKey: 'serviceName', title: '量包', width: 160, cell: 'serviceName' },
  { colKey: 'specification', title: '总量', align: 'right' as const, cell: 'specification' },
  { colKey: 'used', title: '已用', align: 'right' as const, cell: 'used' },
  { colKey: 'expiredTime', title: '到期时间', width: 170, cell: 'expiredTime' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

const tpmColumns = [
  { colKey: 'model', title: '模型', width: 150, cell: 'model' },
  { colKey: 'tpm', title: 'TPM 配额', align: 'right' as const, cell: 'tpm' },
  { colKey: 'paymentTiming', title: '付费', width: 90, cell: 'paymentTiming' },
  { colKey: 'status', title: '状态', width: 90, cell: 'status' },
]

function statusTheme(status: string): 'success' | 'warning' | 'default' {
  if (status === 'Active' || status === 'Running') {
    return 'success'
  }
  if (status === 'Exhausted' || status === 'Expired' || status === 'Stopped') {
    return 'warning'
  }
  return 'default'
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    Pending: '待使用',
    Active: '使用中',
    Exhausted: '已用尽',
    Expired: '已过期',
    Running: '运行中',
    Creating: '创建中',
    Stopped: '已停止',
  }
  return labels[status] ?? status
}

function formatTime(iso: string): string {
  return iso ? iso.replace('T', ' ').replace(/Z$/, '') : '—'
}
</script>

<template>
  <AccountSection
    title="百度千帆"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 BAIDU_ACCESS_KEY_ID / BAIDU_SECRET_KEY"
  >
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
                <t-descriptions-item label="别名">
                  {{ account.label || '未配置（用 BAIDU_LABEL / BAIDU_LABEL_N 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
              </t-descriptions>

              <t-divider align="left">量包明细（{{ account.packages.length }}）</t-divider>
              <t-table
                v-if="account.packages.length > 0"
                :data="account.packages"
                :columns="packageColumns"
                row-key="packageId"
                max-height="300"
                size="small"
              >
                <template #serviceName="{ row }">{{ row.serviceName }}</template>
                <template #specification="{ row }">
                  <span class="num">{{ row.specification }}</span>
                </template>
                <template #used="{ row }">
                  <span class="num">{{ row.used }}</span>
                </template>
                <template #expiredTime="{ row }">{{ formatTime(row.expiredTime) }}</template>
                <template #status="{ row }">
                  <t-tag size="small" variant="light-outline" :theme="statusTheme(row.status)">
                    {{ statusLabel(row.status) }}
                  </t-tag>
                </template>
              </t-table>
              <t-empty v-else description="无量包（可在千帆控制台购买 Token 量包）" />

              <template v-if="account.tpmQuotas.length > 0">
                <t-divider align="left">TPM 配额（{{ account.tpmQuotas.length }}）</t-divider>
                <t-table
                  :data="account.tpmQuotas"
                  :columns="tpmColumns"
                  row-key="instanceId"
                  max-height="200"
                  size="small"
                >
                  <template #model="{ row }">{{ row.model }}</template>
                  <template #tpm="{ row }">
                    <span class="num">{{ formatCount(row.tpm) }}</span>
                  </template>
                  <template #paymentTiming="{ row }">
                    {{ row.paymentTiming === 'Postpaid' ? '后付费' : row.paymentTiming }}
                  </template>
                  <template #status="{ row }">
                    <t-tag size="small" variant="light-outline" :theme="statusTheme(row.status)">
                      {{ statusLabel(row.status) }}
                    </t-tag>
                  </template>
                </t-table>
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

          <div v-else :class="metricGridClass(3)">
            <t-statistic
              title="量包（近 7 天用量）"
              :value="account.usage.totalTokens"
              :format="formatTokens"
            />
            <t-statistic
              title="调用次数"
              :value="account.usage.totalCalls"
              separator=","
              :decimal-places="0"
            />
            <t-statistic title="活跃服务" :value="account.usage.serviceCount" :decimal-places="0" />
          </div>
        </div>
      </div>
    </template>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处无区块特有样式 */
</style>
