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
  PlanAccountUsage,
  WindowQuota,
} from '../types'
import {
  identityFields,
  field,
  notice,
  resetAtNote,
  resetNote,
  table,
  windowQuota,
} from '../detail'
import { formatNumber } from '../format'
import { PLAN_WINDOW_LABELS, windowStatusLabel } from '../utils'

type PlansAccount = PlanAccountUsage & AccountIdentity

/**
 * 平台专属窗口名：OpenCode Go 的 `monthly` 是 rolling 30 天，叫「每月窗口」会让人
 * 以为按自然月重置；写「30 天窗口」才是它的真实语义。
 */
const PROVIDER_WINDOW_LABELS: Record<string, Record<string, string>> = {
  'OpenCode Go': { monthly: '30 天窗口' },
}

/** 各平台用量端点（详情弹窗里的「数据来源」，排障时用得上）。 */
const PROVIDER_ENDPOINTS: Record<string, string> = {
  'Kimi For Coding': 'GET api.kimi.com/coding/v1/usages',
  MiniMax: 'GET api.minimaxi.com/v1/api/openplatform/coding_plan/remains',
  'OpenCode Go': 'GET opencode.ai/zen/go/v1/usage',
}

export function windowLabelOf(provider: string, window: string): string {
  return PROVIDER_WINDOW_LABELS[provider]?.[window] ?? PLAN_WINDOW_LABELS[window] ?? window
}

function windowsOf(account: PlansAccount, provider: string): WindowQuota[] {
  return account.windows.map((window) =>
    windowQuota({
      key: window.window,
      label: windowLabelOf(provider, window.window),
      // 上游只给百分比，没有「已用 / 总量」计数 → 数值行退化成「已用 N%」
      percent: window.percent,
      resetAt: window.resetTime,
      ...(window.status ? { status: window.status } : {}),
    }),
  )
}

function windowTable(account: PlansAccount, provider: string): DataTable {
  return table(
    '窗口明细',
    [
      { key: 'window', label: '窗口' },
      { key: 'percent', label: '已用', align: 'right' },
      { key: 'status', label: '上游状态', kind: 'status' },
      { key: 'reset', label: '重置倒计时' },
      { key: 'resetAt', label: '重置时间' },
    ],
    account.windows.map((window) => ({
      _key: window.window,
      window: windowLabelOf(provider, window.window),
      percent: `${formatNumber(window.percent)}%`,
      status: window.status ? windowStatusLabel(window.status) : '正常',
      reset: resetNote(window.resetTime),
      resetAt: resetAtNote(window.resetTime),
    })),
  )
}

export function toPlansDetail(account: PlansAccount, provider: string): AccountDetail {
  return {
    identity: identityFields(account, '*_LABEL / *_LABEL_N'),
    windows: windowsOf(account, provider),
    balances: [],
    metrics: [],
    tables: [windowTable(account, provider)],
    meta: [field('平台', provider), field('数据来源', PROVIDER_ENDPOINTS[provider] ?? null)],
    links: [],
    // 账号级用量错误（不是鉴权失败）也算故障信号：卡片上给告警，弹窗里沉底
    notices: account.error ? [notice('warn', account.error)] : [],
  }
}
