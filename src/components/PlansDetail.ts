/**
 * 套餐类订阅平台（Kimi For Coding / MiniMax / OpenCode Go / Command Code / ZenMux）
 * → 统一展示模型（issue #20）。
 *
 * 所有额度信息都落在窗口条上：窗口名、百分比、绝对额度、上游状态、重置倒计时与
 * 具体时刻。窗口条本身已经是一张明细表，不再额外生成「窗口明细」表。
 * 平台差异（窗口叫法）收在映射表里。
 */
import type {
  AccountDetail,
  AccountIdentity,
  Metric,
  PlanAccountUsage,
  WindowQuota,
} from '../types'
import { countMetric, identityFields, field, moneyMetric, notice, windowQuota } from '../detail'
import { currencySymbol } from '../format'
import { consoleLinks } from '../consoleLinks'
import { PLAN_WINDOW_LABELS } from '../utils'

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

function isMoneyUnit(unit: string): boolean {
  return MONEY_UNIT[unit.toUpperCase()] === true
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
    identity: identityFields(account),
    windows: windowsOf(account, provider),
    balances: balanceMetrics(account),
    metrics: [],
    tables: [],
    meta: account.plan ? [field('套餐', account.plan)] : [],
    links: consoleLinks(provider, account.consoleUrl),
    // 账号级用量错误（不是鉴权失败）也算故障信号：卡片上给告警，弹窗里沉底
    notices: account.error ? [notice('warn', account.error)] : [],
  }
}
