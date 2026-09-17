/**
 * OpenRouter → 统一展示模型（issue #20）。
 */
import type { AccountDetail, AccountIdentity, OpenRouterDetailData } from '../types'
import { field, flag, identityFields, link, moneyField, moneyMetric } from '../detail'
import { currencySymbol } from '../format'

type OpenRouterAccount = OpenRouterDetailData & AccountIdentity

/**
 * 服务端给的 `unit` 是**币种代码**（`'USD'`），不是展示符号。
 * 走 `moneyMetric` / `moneyField` 让 `currencySymbol()` 统一换算成 `$`，
 * 卡面才不会出现 `56.70 USD` 这种带代码的读数（#19）。
 */
const CURRENCY = 'USD'

/** 密钥限额的重置周期：上游给的是 `monthly` / `weekly` / `daily` 这种枚举。 */
function limitResetLabel(reset: string | null): string | null {
  if (!reset) {
    return null
  }
  const labels: Record<string, string> = {
    monthly: '每月重置',
    weekly: '每周重置',
    daily: '每日重置',
  }
  return labels[reset] ?? reset
}

/** ISO 时间戳 → 本地可读；null 是**有含义**的（永久有效），不是缺值。 */
function expiryLabel(iso: string | null): string {
  return iso ? iso.replace('T', ' ').replace(/Z$/, '') : '永久有效'
}

export function toOpenRouterDetail(account: OpenRouterAccount): AccountDetail {
  // 限额余量低于 1 美元标红：这是**危险读数**，卡面与弹窗一致
  const lowLimit = account.limitRemaining !== null && account.limitRemaining <= 1
  return {
    identity: identityFields(account, 'OPENROUTER_LABEL / OPENROUTER_LABEL_N'),
    balances: [
      {
        key: 'balance',
        label: '剩余额度',
        value: account.balance,
        kind: 'money',
        unit: currencySymbol(CURRENCY),
        ...(lowLimit ? { tone: 'danger' as const } : {}),
      },
    ],
    metrics: [
      // 限额是「密钥级」的：没有限额的密钥不渲染这一格（区级有无）
      ...(account.limit === null
        ? []
        : [moneyMetric('limit-remaining', '限额剩余', account.limitRemaining, CURRENCY)]),
      moneyMetric('usage-daily', '今日用量', account.usageDaily, CURRENCY),
    ],
    windows: [],
    tables: [],
    meta: [
      field('账户类型', account.isFreeTier ? '免费层' : '付费'),
      flag('管理密钥', account.isManagementKey),
      moneyField('充值总额', account.total ?? null, CURRENCY),
      field('限额重置', limitResetLabel(account.limitReset)),
      moneyField('本周用量', account.usageWeekly, CURRENCY),
      moneyField('本月用量', account.usageMonthly, CURRENCY),
      field('Key 有效期', expiryLabel(account.expiresAt)),
    ],
    links: [link('控制台', 'https://openrouter.ai/credits', 'console')],
    notices: [],
  }
}
