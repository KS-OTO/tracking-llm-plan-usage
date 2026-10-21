/**
 * 套餐类订阅平台（Kimi For Coding / MiniMax / OpenCode Go）→ 统一展示模型（issue #20）。
 *
 * 三家都只有「窗口 + 百分比」，没有余额与明细表，因此模型里只有 W 语义 +
 * 一张窗口明细表。平台差异（窗口叫法、用量端点）收在下面两张映射表里。
 */
import type {
  AccountDetail,
  AccountIdentity,
  DataTable,
  Metric,
  PlanAccountUsage,
  WindowQuota,
} from '../types'
import {
  countMetric,
  identityFields,
  field,
  moneyMetric,
  notice,
  resetAtNote,
  resetNote,
  table,
  windowQuota,
} from '../detail'
import { currencySymbol, formatCurrency, formatNumber } from '../format'
import { PLAN_WINDOW_LABELS, windowStatusLabel } from '../utils'

type PlansAccount = PlanAccountUsage & AccountIdentity

/** 需要货币符号的额度单位；其余（credits）按计数格式展示。 */
const MONEY_UNIT: Record<string, true> = {
  USD: true,
  CNY: true,
  RMB: true,
  EUR: true,
  JPY: true,
  GBP: true,
}

/**
 * 平台专属窗口名：OpenCode Go 的 `monthly` 是 rolling 30 天，叫「每月窗口」会让人
 * 以为按自然月重置；写「30 天窗口」才是它的真实语义。
 */
const PROVIDER_WINDOW_LABELS: Record<string, Record<string, string>> = {
  'OpenCode Go': { monthly: '30 天窗口' },
  'Command Code': { monthly: '计费周期' },
  ZenMux: { weekly: '7 天窗口' },
}

/** 各平台用量端点（详情弹窗里的「数据来源」，排障时用得上）。 */
const PROVIDER_ENDPOINTS: Record<string, string> = {
  'Kimi For Coding': 'GET api.kimi.com/coding/v1/usages',
  MiniMax: 'GET api.minimax.io/v1/token_plan/remains',
  'OpenCode Go': 'GET opencode.ai/zen/go/v1/usage',
  'Command Code': 'GET api.commandcode.ai/alpha/billing/credits',
  ZenMux: 'GET {ZENMUX_BASE_URL}',
}

function isMoneyUnit(unit: string): boolean {
  return MONEY_UNIT[unit.toUpperCase()] === true
}

/** 绝对额度文本：货币两侧带符号；credits 等计数单位只出现一次。 */
function amountText(used: number, total: number, unit: string | undefined): string {
  if (unit && isMoneyUnit(unit)) {
    return `${formatCurrency(used, unit)} / ${formatCurrency(total, unit)}`
  }
  const pair = `${formatNumber(used)} / ${formatNumber(total)}`
  return unit ? `${pair} ${unit}` : pair
}

export function windowLabelOf(provider: string, window: string): string {
  return PROVIDER_WINDOW_LABELS[provider]?.[window] ?? PLAN_WINDOW_LABELS[window] ?? window
}

function windowsOf(account: PlansAccount, provider: string): WindowQuota[] {
  return account.windows.map((window) =>
    windowQuota({
      key: window.window,
      label: windowLabelOf(provider, window.window),
      // 上游只给百分比时退化成「已用 N%」；货币额度型套餐带上绝对用量
      percent: window.percent,
      resetAt: window.resetTime,
      ...(window.used !== undefined ? { used: window.used } : {}),
      ...(window.total !== undefined ? { total: window.total } : {}),
      ...(window.unit
        ? {
            unit: isMoneyUnit(window.unit) ? currencySymbol(window.unit) : window.unit,
            countKind: isMoneyUnit(window.unit) ? ('money' as const) : ('count' as const),
          }
        : {}),
      ...(window.status ? { status: window.status } : {}),
    }),
  )
}

function windowTable(account: PlansAccount, provider: string): DataTable {
  const hasAmounts = account.windows.some((window) => window.used !== undefined)
  return table(
    '窗口明细',
    [
      { key: 'window', label: '窗口' },
      { key: 'percent', label: '已用', align: 'right' },
      ...(hasAmounts ? [{ key: 'amount', label: '额度', align: 'right' as const }] : []),
      { key: 'status', label: '上游状态', kind: 'status' },
      { key: 'reset', label: '重置倒计时' },
      { key: 'resetAt', label: '重置时间' },
    ],
    account.windows.map((window) => ({
      _key: window.window,
      window: windowLabelOf(provider, window.window),
      percent: `${formatNumber(window.percent)}%`,
      ...(hasAmounts
        ? {
            amount:
              window.used !== undefined && window.total !== undefined
                ? amountText(window.used, window.total, window.unit)
                : '—',
          }
        : {}),
      status: window.status ? windowStatusLabel(window.status) : '正常',
      reset: resetNote(window.resetTime),
      resetAt: resetAtNote(window.resetTime),
    })),
  )
}

function balanceMetrics(account: PlansAccount): Metric[] {
  const balance = account.balance
  if (!balance) {
    return []
  }
  const label = balance.label ?? '账户余额'
  return isMoneyUnit(balance.unit)
    ? [moneyMetric('plan-balance', label, balance.remaining, balance.unit)]
    : [countMetric('plan-balance', label, balance.remaining, balance.unit)]
}

export function toPlansDetail(account: PlansAccount, provider: string): AccountDetail {
  return {
    identity: identityFields(account, '*_LABEL / *_LABEL_N'),
    windows: windowsOf(account, provider),
    balances: balanceMetrics(account),
    metrics: [],
    tables: [windowTable(account, provider)],
    meta: [
      field('平台', provider),
      ...(account.plan ? [field('套餐', account.plan)] : []),
      field('数据来源', PROVIDER_ENDPOINTS[provider] ?? null),
    ],
    links: [],
    // 账号级用量错误（不是鉴权失败）也算故障信号：卡片上给告警，弹窗里沉底
    notices: account.error ? [notice('warn', account.error)] : [],
  }
}
