<script setup lang="ts">
/**
 * 智谱 GLM。
 *
 * - plan 变体（套餐订阅 Tab）：卡片只留 Coding Plan 窗口额度；等级、控制台入口、
 *   账户余额与资源包明细收进「详情」弹窗。
 * - balance 变体（余额账户 Tab）：卡片留余额读数；资源包明细表收进「详情」弹窗。
 *
 * 三个子接口（Coding Plan 额度 / 余额 / 资源包）各自独立容错：任一路失败只降级它
 * 自己那块，其余照常渲染 —— 未订阅 GLM Coding Plan 时上游会对额度接口直接 500，
 * 那不该让余额和资源包一起消失。
 */
import { computed } from 'vue'
import type {
  ZhipuAccountBalance,
  ZhipuCodingPlanQuota,
  ZhipuPackagesResponse,
  WindowQuota,
} from '../types'
import { accountTitle, isFailedAccount, sliceData, sliceError } from '../types'
import { currencySymbol, formatCurrency, formatTokens, truncateMoney } from '../format'
import { metricGridClass, windowContainerClass } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'
import UsageBar from './ui/UsageBar.vue'

const props = defineProps<{
  data: ZhipuPackagesResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
  /** 卡片变体：plan = Coding Plan 额度（套餐订阅 Tab）；balance = 余额/资源包（余额账户 Tab）。 */
  variant?: 'plan' | 'balance'
}>()

/** 智谱余额一律 CNY，卡面按统一规则只显示**符号**（#19）。 */
const UNIT = currencySymbol('CNY')

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
}

/** Coding Plan 窗口 → 统一模型（`WindowQuota`）：三个子接口里唯一带完整计数的窗口。 */
function codingWindows(codingPlan: ZhipuCodingPlanQuota | null): WindowQuota[] {
  return (codingPlan?.windows ?? []).map((window) => ({
    key: window.window,
    label: WINDOW_LABELS[window.window] ?? window.window,
    used: window.used,
    total: window.total,
    remaining: window.remaining,
    percent: window.percentage,
    resetAt: window.nextResetTime > 0 ? window.nextResetTime : null,
  }))
}

function creditStatusLabel(status: string): string {
  if (status === 'ENABLE') {
    return '已开通'
  }
  if (status === 'NOT_OPEN') {
    return '未开通'
  }
  if (status === 'DISABLE') {
    return '已关闭'
  }
  return status || '—'
}

function packageTypeLabel(type: string): string {
  if (type === 'pay') {
    return '付费'
  }
  if (type === 'give') {
    return '赠送'
  }
  return type || '—'
}

/** 别名提示：不同变体对应不同 Tab，提示保持同一份即可（前缀相同）。 */
const ALIAS_HINT = '未配置（用 ZHIPU_LABEL / ZHIPU_LABEL_N 设置）'

const packageColumns = [
  { colKey: 'name', title: '资源包', width: 180, cell: 'name' },
  { colKey: 'type', title: '类型', width: 60, cell: 'type' },
  { colKey: 'total', title: '总额', align: 'right' as const, cell: 'total' },
  { colKey: 'remaining', title: '剩余', align: 'right' as const, cell: 'remaining' },
  { colKey: 'expire', title: '到期时间', width: 140, cell: 'expire' },
]

function packageRowsOf(
  packages: Array<{
    id: number
    resourcePackageName: string
    suitableScene?: string
    type?: string
    tokensMagnitude: number
    availableBalance: number
    packageExpirationTime?: string
    status?: string
  }>,
) {
  return packages
    .filter((pkg) => pkg.status === 'EFFECTIVE' || pkg.status === 'NOTUSED')
    .map((pkg) =>
      Object.assign({}, pkg, {
        _key: String(pkg.id),
        _name: pkg.resourcePackageName,
        _scene: pkg.suitableScene ?? '',
      }),
    )
}

/**
 * 卡片视图：**字段恒存在的扁平对象**。
 *
 * 切片（`{data} | {error}`）在模板里没法直接收窄，因此在这里一次性展平成
 * 「数据 + 错误」两个恒存在的字段，模板只管读。
 */
interface ZhipuCard {
  keyHint: string
  label?: string
  /** 账号级失败（三个子接口之外的整体失败），null 表示账号本身查得到。 */
  error: string | null
  codingPlan: ZhipuCodingPlanQuota | null
  codingPlanError: string | null
  balance: ZhipuAccountBalance | null
  balanceError: string | null
  packages: ReturnType<typeof packageRowsOf>
  packagesError: string | null
}

/** 单个账号展平：切片拆成「数据 + 错误」两组恒存在的字段。 */
function toCard(account: NonNullable<ZhipuPackagesResponse['accounts']>[number]): ZhipuCard {
  if (isFailedAccount(account)) {
    return {
      keyHint: account.keyHint,
      ...(account.label ? { label: account.label } : {}),
      error: account.error,
      codingPlan: null,
      codingPlanError: null,
      balance: null,
      balanceError: null,
      packages: [],
      packagesError: null,
    }
  }
  return {
    keyHint: account.keyHint,
    ...(account.label ? { label: account.label } : {}),
    error: null,
    codingPlan: sliceData(account.codingPlan),
    codingPlanError: sliceError(account.codingPlan),
    balance: sliceData(account.balance),
    balanceError: sliceError(account.balance),
    packages: packageRowsOf(sliceData(account.packages) ?? []),
    packagesError: sliceError(account.packages),
  }
}

/** 每账号展平一次（详情弹窗与卡片读数共用，避免每次渲染重复过滤/映射）。 */
const cards = computed<ZhipuCard[]>(() => (props.data?.accounts ?? []).map(toCard))
</script>

<template>
  <AccountSection
    :title="variant === 'balance' ? '智谱 GLM 余额' : '智谱 GLM Coding Plan'"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 ZHIPU_API_KEY"
  >
    <template v-if="data">
      <div class="grid-cards grid-cards--wide">
        <div v-for="card in cards" :key="card.keyHint" class="account-group">
          <div class="account-head">
            <span v-if="card.label" class="account-name">{{ card.label }}</span>
            <span class="key-hint" :class="{ 'key-hint-secondary': card.label }">
              {{ card.keyHint }}
            </span>
            <DetailDialog
              v-if="!card.error"
              :title="accountTitle(card)"
              :subtitle="card.label ? card.keyHint : undefined"
            >
              <t-descriptions :column="2" size="small" class="detail-block">
                <t-descriptions-item label="别名">
                  {{ card.label || ALIAS_HINT }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ card.keyHint }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="Coding Plan 等级">
                  {{ card.codingPlan?.level || '未查询到（可能未订阅）' }}
                </t-descriptions-item>
                <t-descriptions-item label="控制台用量页">
                  <a
                    href="https://www.bigmodel.cn/coding-plan/personal/usage"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 ↗
                  </a>
                </t-descriptions-item>
                <!-- 余额账户变体：次级金额指标已从卡片移到这里，避免卡片堆满数字 -->
                <template v-if="variant === 'balance'">
                  <t-descriptions-item label="信用支付">
                    {{ creditStatusLabel(card.balance?.creditStatus ?? '') }}
                  </t-descriptions-item>
                  <t-descriptions-item label="累计充值">
                    {{ formatCurrency(card.balance?.rechargeAmount ?? 0, 'CNY') }}
                  </t-descriptions-item>
                  <t-descriptions-item label="赠送金额">
                    {{ formatCurrency(card.balance?.giveAmount ?? 0, 'CNY') }}
                  </t-descriptions-item>
                </template>
              </t-descriptions>

              <t-divider align="left">资源包（{{ card.packages.length }}）</t-divider>
              <t-alert
                v-if="card.packagesError"
                theme="warning"
                title="资源包查询失败"
                :message="card.packagesError"
                :max-line="5"
              />
              <t-table
                v-if="card.packages.length > 0"
                :data="card.packages"
                :columns="packageColumns"
                row-key="_key"
                max-height="360"
                size="small"
              >
                <template #name="{ row }">
                  <div>{{ row._name }}</div>
                  <div class="muted text-narrow">{{ row._scene }}</div>
                </template>
                <template #type="{ row }">{{ packageTypeLabel(row.type) }}</template>
                <template #total="{ row }">{{ formatTokens(row.tokensMagnitude) }}</template>
                <template #remaining="{ row }">{{ formatTokens(row.availableBalance) }}</template>
                <template #expire="{ row }">{{
                  row.packageExpirationTime ? row.packageExpirationTime.replace('T', ' ') : '—'
                }}</template>
              </t-table>
              <t-empty v-else-if="!card.packagesError" description="没有生效中的资源包" />
            </DetailDialog>
          </div>

          <t-alert
            v-if="card.error"
            theme="error"
            :title="`${accountTitle(card)} 查询失败`"
            :message="card.error"
            :max-line="5"
          />

          <template v-else>
            <div
              v-if="variant !== 'balance' && codingWindows(card.codingPlan).length > 0"
              :class="windowContainerClass(codingWindows(card.codingPlan).length)"
            >
              <UsageBar
                v-for="window in codingWindows(card.codingPlan)"
                :key="window.key"
                :quota="window"
              />
            </div>
            <!-- 额度查不到时优先说明原因；上游对未订阅账号直接 500，别只说「未查询到」 -->
            <t-alert
              v-else-if="variant !== 'balance' && card.codingPlanError"
              theme="warning"
              title="Coding Plan 额度"
              :message="card.codingPlanError"
              :max-line="5"
            />
            <t-empty
              v-else-if="variant !== 'balance'"
              description="未查询到 Coding Plan 额度（可能未订阅）"
            />

            <div v-if="variant !== 'plan' && card.balance" :class="metricGridClass(2)">
              <t-statistic
                title="可用余额"
                :value="truncateMoney(card.balance.availableBalance)"
                :decimal-places="2"
                :unit="UNIT"
              />
              <t-statistic
                title="账户余额"
                :value="truncateMoney(card.balance.balance)"
                :decimal-places="2"
                :unit="UNIT"
              />
            </div>
            <t-alert
              v-else-if="variant !== 'plan' && card.balanceError"
              theme="warning"
              title="账户余额"
              :message="card.balanceError"
              :max-line="5"
            />
          </template>
        </div>
      </div>
    </template>
  </AccountSection>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处无区块特有样式 */
</style>
