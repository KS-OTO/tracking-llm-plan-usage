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
 * 额度单位由服务端读站点 `/api/status` 的 `quota_display_type` 得出（USD / CNY / CUSTOM / TOKENS），
 * 数值也已按站点设置折算；账单接口回落时 `currency` 为 null，币种无法反推，不显示单位。
 */
import { computed } from 'vue'

import type {
  NewApiModelUsage,
  NewApiQuotaUnit,
  NewApiResponse,
  NewApiSubscription,
  NewApiWallet,
  WindowQuota,
} from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatCount, formatMoney, progressPercentage, truncateMoney } from '../format'
import { formatDateTime, metricGridClass, windowContainerClass } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'
import UsageBar from './ui/UsageBar.vue'

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
  currency: NewApiQuotaUnit | null
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
          currency: null,
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

/**
 * 读数瓦片的单位串。
 *
 * 用 `unit`（单位，渲染在数值后、14px）而不是 `suffix`（后缀，18px、左边距更大）——
 * 货币是**单位**，`suffix` 留给「无限额度」这类说明性后缀。见 assets/layout.css 的 .account-head 注释。
 */
function currencyUnit(row: NewApiRow): string | undefined {
  return row.currency?.unit || undefined
}

/** 详情弹窗里的「额度单位」说明：类型 + 符号（账单接口回落时币种未知）。 */
function currencyLabel(row: NewApiRow): string {
  if (!row.currency) {
    return '未知（账单接口返回，币种由站点折算，无法反推）'
  }
  const names: Record<NewApiQuotaUnit['type'], string> = {
    USD: '美元',
    CNY: '人民币',
    CUSTOM: '站点自定义货币',
    TOKENS: '点数（按 quota 原值展示）',
  }
  return `${names[row.currency.type]}（${row.currency.unit}）`
}

function integer(value: number | null | undefined): string {
  return formatCount(value)
}

/**
 * 弹窗内「按模型用量」表的列定义。
 *
 * 用 `cell` 指向**预计算好的文本字段**（`_quota` / `_usage`），因此整表不需要任何插槽：
 * 表格槽位的 `row` 会遮蔽外层的 `row`（账号行），一旦在槽里写 `row.currency`
 * 就会指到模型行上 —— 这类遮蔽错误编译期不报，只有渲染出来才发现。
 */
const modelColumns = [
  { colKey: 'model', title: '模型', cell: 'model' },
  { colKey: 'quota', title: '额度', align: 'right' as const, cell: '_quota' },
  { colKey: 'usage', title: '请求 / Tokens', align: 'right' as const, cell: '_usage' },
]

/** 按模型用量行：额度与用量在这里格式化完，渲染层只读字符串。 */
function modelRows(row: NewApiRow) {
  return row.models.map((model) =>
    Object.assign({}, model, {
      _key: model.model,
      _quota: formatMoney(model.quota, currencyUnit(row)),
      _usage: `${integer(model.requests)} 次 · ${integer(model.tokens)} tokens`,
    }),
  )
}

function dateTime(value: number | null): string {
  return value ? formatDateTime(value) : '—'
}

/**
 * 周期长度提示（④ 脚注行）：订阅周期多为 7 / 30 天，站点可自定义。
 *
 * 取不到时返回**空串**而不是 `—`：没有这条信息就不进脚注行，
 * 比在行尾挂一个破折号干净（`UsageBar` 的 `note` 为空时不渲染该段）。
 */
function cycleNote(sub: NewApiSubscription): string {
  if (!sub.lastResetAt || !sub.nextResetAt) {
    return ''
  }
  const days = (sub.nextResetAt - sub.lastResetAt) / 86_400_000
  return `周期 ${days >= 1 ? `${formatCount(days)} 天` : `${formatCount(days * 24)} 小时`}`
}

/**
 * 订阅周期窗口 → 统一模型（`WindowQuota`）。这就是 #20 里各平台适配器的形态：
 * 平台原始字段只在适配函数里出现，渲染层（`UsageBar`）只认模型。
 *
 * `countKind: 'money'` 必须显式声明：站点可把额度折算成金额，缺省的 `tokens`
 * 会把 `12.00` 缩写成 `12`。币种未知（账单接口回落）时 `unit` 为 undefined，
 * 此时只显示数值，不猜符号。
 */
function subscriptionWindow(sub: NewApiSubscription, unit: string | undefined): WindowQuota {
  return {
    key: 'subscription',
    label: '本周期额度',
    used: sub.used,
    total: sub.total,
    remaining: sub.remain,
    percent: sub.percent,
    resetAt: sub.nextResetAt ?? null,
    unit,
    countKind: 'money',
  }
}

/** 钱包读数的个数：累计请求数可能缺失（账单接口回落），网格列数要跟着变（#19）。 */
function walletMetricCount(row: NewApiRow): number {
  const count = row.wallet?.requestCount
  return count === null || count === undefined ? 2 : 3
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
    empty-text="未配置 NEWAPI_BASE_URL / NEWAPI_TOKEN"
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
                {{ currencyLabel(row) }}
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
              <t-divider align="left">窗口内按模型用量（Top {{ row.models.length }}）</t-divider>
              <div class="detail-block">
                <t-table
                  :data="modelRows(row)"
                  :columns="modelColumns"
                  row-key="_key"
                  max-height="300"
                  size="small"
                />
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
          <div v-if="row.subscription" :class="windowContainerClass(1)">
            <UsageBar
              :quota="subscriptionWindow(row.subscription, currencyUnit(row))"
              used-label="本周期已用"
              :note="cycleNote(row.subscription)"
            />
          </div>

          <!-- 钱包：只减不重置的余额 -->
          <div v-if="row.wallet" :class="metricGridClass(walletMetricCount(row))">
            <t-statistic
              title="钱包余额"
              :value="row.wallet.unlimited ? 0 : truncateMoney(row.wallet.remain ?? 0)"
              :decimal-places="2"
              :unit="row.wallet.unlimited ? undefined : currencyUnit(row)"
              :suffix="row.wallet.unlimited ? '无限额度' : undefined"
              :color="!row.wallet.unlimited && (row.wallet.remain ?? 0) < 1 ? 'red' : undefined"
            />
            <t-statistic
              title="累计已用"
              :value="truncateMoney(row.wallet.used)"
              :decimal-places="2"
              :unit="currencyUnit(row)"
            />
            <t-statistic
              v-if="row.wallet.requestCount !== null"
              title="累计请求数"
              :value="row.wallet.requestCount"
              :decimal-places="0"
            />
          </div>

          <p v-if="row.currency === null" class="muted window-foot">
            站点未提供额度口径（走的是账单接口），读数不带货币符号，仅作相对参考
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
