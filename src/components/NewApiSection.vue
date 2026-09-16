<script setup lang="ts">
/**
 * New API（自托管大模型订阅网关）额度卡片。
 *
 * 一张卡可能呈现两件事，取决于服务端判定的 `mode`：
 * - **订阅**（subscription / both）：周期额度窗口 —— 已用百分比、周期额度、下次重置时间
 *   （订阅额度每个周期清零，归「套餐订阅」Tab）
 * - **钱包**（wallet）：充值余额 —— 剩余 / 累计已用 / 请求数（只减不重置，归「余额账户」Tab）
 *
 * 两者可能同时存在（mode = 'both'），此时订阅为主、钱包余额作次要读数。
 * 单位随数据来源变化：管理接口折算为 USD，账单接口由站点自行折算、币种未知。
 */
import { computed } from 'vue'

import type { NewApiModelUsage, NewApiResponse, NewApiSubscription, NewApiWallet } from '../types'
import { accountTitle, isFailedAccount } from '../types'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

const props = defineProps<{
  data: NewApiResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

/**
 * 视图行：成功与失败两种账号**共用同一套字段**，失败时取中性空值。
 * 不在模板里对 AccountEnvelope 做类型收窄：TS 无法对调用表达式收窄，
 * `account.subscription` 会被判为属性不存在（TS2339）。拍平后模板只判断 `row.error`。
 */
interface NewApiRow {
  keyHint: string
  label?: string
  error: string | null
  baseUrl: string
  consoleUrl: string
  modelsUrl: string
  source: 'api' | 'billing'
  unit: 'USD' | 'site'
  username: string | null
  group: string | null
  mode: 'subscription' | 'wallet' | 'both'
  billingPreference: string | null
  subscription: NewApiSubscription | null
  wallet: NewApiWallet | null
  models: NewApiModelUsage[]
  windowStart: number | null
  windowEnd: number | null
  stats: { quota: number; rpm: number; tpm: number } | null
}

const rows = computed<NewApiRow[]>(() =>
  (props.data?.accounts ?? []).map((account) =>
    isFailedAccount(account)
      ? {
          keyHint: account.keyHint,
          label: account.label,
          error: account.error,
          baseUrl: '',
          consoleUrl: '',
          modelsUrl: '',
          source: 'billing' as const,
          unit: 'site' as const,
          username: null,
          group: null,
          mode: 'wallet' as const,
          billingPreference: null,
          subscription: null,
          wallet: null,
          models: [],
          windowStart: null,
          windowEnd: null,
          stats: null,
        }
      : Object.assign({}, account, { error: null }),
  ),
)

/** 卡片级外链只在「只有一个站点」时给出：多站点时链接属于各自的账号卡（弹窗内）。 */
const singleSite = computed(() => {
  const ok = rows.value.filter((row) => row.error === null)
  return ok.length === 1 ? ok[0] : null
})

function amount(value: number | null | undefined, unit: NewApiRow['unit']): string {
  if (value === null || value === undefined) {
    return '无限'
  }
  const text = value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return unit === 'USD' ? `${text} USD` : text
}

function integer(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  return Math.round(value).toLocaleString('zh-CN')
}

function dateTime(value: number | null): string {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

/** 周期长度：订阅周期多为 7 / 30 天，站点可自定义。 */
function cycleDays(row: NewApiRow): string {
  const sub = row.subscription
  if (!sub?.lastResetAt || !sub.nextResetAt) {
    return '—'
  }
  const days = (sub.nextResetAt - sub.lastResetAt) / 86_400_000
  return days >= 1 ? `${Math.round(days)} 天` : `${Math.round(days * 24)} 小时`
}

function modeLabel(row: NewApiRow): string {
  if (row.mode === 'subscription') {
    return '订阅计费'
  }
  if (row.mode === 'both') {
    return `订阅 + 钱包（${row.billingPreference ?? '未指定优先'}）`
  }
  return '钱包计费'
}
</script>

<template>
  <AccountSection
    title="New API"
    :subtitle="`站点 ${rows.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="rows.length === 0"
    empty-text="未配置 NEWAPI_BASE_URL / NEWAPI_API_KEY"
    :models-url="singleSite?.modelsUrl"
  >
    <template #actions>
      <a
        v-if="singleSite"
        class="muted"
        :href="singleSite.consoleUrl"
        target="_blank"
        rel="noreferrer"
      >
        控制台 ↗
      </a>
    </template>

    <div v-if="rows.length > 0" class="grid-cards grid-cards--wide">
      <div v-for="row in rows" :key="row.keyHint" class="account-group">
        <div class="account-head">
          <span v-if="row.label" class="account-name">{{ row.label }}</span>
          <span class="key-hint" :class="{ 'key-hint-secondary': row.label }">
            {{ row.keyHint }}
          </span>
          <t-tag
            v-if="row.error === null"
            :theme="row.subscription ? 'primary' : 'default'"
            size="small"
          >
            {{ row.subscription ? '订阅' : '钱包' }}
          </t-tag>
          <DetailDialog
            v-if="row.error === null"
            :title="accountTitle(row)"
            :subtitle="row.label ? row.keyHint : undefined"
          >
            <t-descriptions :column="2" size="small" class="detail-block">
              <t-descriptions-item label="站点">{{ row.baseUrl }}</t-descriptions-item>
              <t-descriptions-item label="用户名">{{ row.username ?? '—' }}</t-descriptions-item>
              <t-descriptions-item label="分组">{{ row.group ?? '—' }}</t-descriptions-item>
              <t-descriptions-item label="Key">
                <span class="num">{{ row.keyHint }}</span>
              </t-descriptions-item>
              <t-descriptions-item label="计费模式">{{ modeLabel(row) }}</t-descriptions-item>
              <t-descriptions-item label="数据来源">
                {{ row.source === 'api' ? '管理接口（系统访问令牌）' : '账单接口（API Key）' }}
              </t-descriptions-item>
              <t-descriptions-item label="额度单位">
                {{ row.unit === 'USD' ? 'USD' : '站点自有单位' }}
              </t-descriptions-item>
              <t-descriptions-item label="统计窗口">
                {{ dateTime(row.windowStart) }} → {{ dateTime(row.windowEnd) }}
              </t-descriptions-item>
              <t-descriptions-item v-if="row.subscription" label="订阅有效期至">
                {{ dateTime(row.subscription.endAt) }}
              </t-descriptions-item>
              <t-descriptions-item v-if="row.subscription" label="额度用尽后回落钱包">
                {{ row.subscription.allowWalletOverflow ? '允许' : '不允许' }}
              </t-descriptions-item>
              <t-descriptions-item v-if="row.wallet?.quotaRemain !== null" label="钱包原始 quota">
                <span class="num">
                  {{ integer(row.wallet?.quotaRemain) }} / {{ integer(row.wallet?.quotaUsed) }}
                </span>
              </t-descriptions-item>
              <t-descriptions-item v-if="row.stats" label="每分钟请求 / Token">
                {{ integer(row.stats.rpm) }} / {{ integer(row.stats.tpm) }}
              </t-descriptions-item>
            </t-descriptions>

            <div class="site-links">
              <a :href="row.consoleUrl" target="_blank" rel="noopener noreferrer">控制台 ↗</a>
              <a :href="row.modelsUrl" target="_blank" rel="noopener noreferrer">可用模型 ↗</a>
            </div>

            <template v-if="row.models.length > 0">
              <div class="section-title">
                <span>窗口内按模型用量</span>
                <span class="muted">Top {{ row.models.length }}</span>
              </div>
              <div class="window-list">
                <div v-for="model in row.models" :key="model.model" class="window-block">
                  <div class="group-head">
                    <span class="text-secondary">{{ model.model }}</span>
                    <span class="num-strong">{{ amount(model.quota, row.unit) }}</span>
                  </div>
                  <div class="muted window-foot">
                    {{ integer(model.requests) }} 次请求 · {{ integer(model.tokens) }} tokens
                  </div>
                </div>
              </div>
            </template>
            <p v-else class="muted">窗口内无明细（账单接口不提供按模型用量）</p>
          </DetailDialog>
        </div>

        <t-alert
          v-if="row.error !== null"
          theme="error"
          :title="`${accountTitle(row)} 查询失败`"
          :message="row.error"
          :max-line="5"
        />

        <template v-else>
          <!-- 订阅：周期额度窗口（每周期重置，不能与钱包余额混算） -->
          <div v-if="row.subscription" class="window-list">
            <div class="window-block">
              <div class="group-head">
                <span>本周期已用</span>
                <span class="num-strong">{{ row.subscription.percent.toFixed(1) }}%</span>
              </div>
              <t-progress :percentage="row.subscription.percent" />
              <div class="muted window-meta">
                已用 {{ amount(row.subscription.used, row.unit) }} /
                {{ amount(row.subscription.total, row.unit) }}
              </div>
              <div class="muted window-foot">
                周期 {{ cycleDays(row) }} · 下次重置 {{ dateTime(row.subscription.nextResetAt) }}
              </div>
            </div>
          </div>

          <!-- 钱包：只减不重置的余额 -->
          <div v-if="row.wallet" class="grid-metrics">
            <t-statistic
              title="钱包余额"
              :value="row.wallet.unlimited ? 0 : (row.wallet.remain ?? 0)"
              :decimal-places="2"
              :suffix="row.wallet.unlimited ? '无限额度' : row.unit === 'USD' ? 'USD' : ''"
              :color="!row.wallet.unlimited && (row.wallet.remain ?? 0) < 1 ? 'red' : undefined"
            />
            <t-statistic
              title="累计已用"
              :value="row.wallet.used"
              :decimal-places="2"
              :suffix="row.unit === 'USD' ? 'USD' : ''"
            />
            <t-statistic
              v-if="row.wallet.requestCount !== null"
              title="累计请求数"
              :value="row.wallet.requestCount"
              :decimal-places="0"
            />
          </div>

          <p v-if="row.unit === 'site'" class="muted window-foot">
            额度单位由站点设置决定（接口未返回币种），仅作相对参考
          </p>
        </template>
      </div>
    </div>
  </AccountSection>
</template>

<style scoped>
/* 弹窗内的站点外链：自托管站点没有统一的公共地址，按各自 baseUrl 拼 */
.site-links {
  display: flex;
  gap: var(--td-size-6);
  margin-bottom: var(--td-size-5);
  font-size: var(--td-font-size-body-small);
}

.site-links a {
  color: var(--td-brand-color);
  text-decoration: none;
}

.site-links a:hover,
.site-links a:focus-visible {
  text-decoration: underline;
}
</style>
