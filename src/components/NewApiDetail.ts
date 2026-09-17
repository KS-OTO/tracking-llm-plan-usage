/**
 * New API（自托管订阅网关）→ 统一展示模型（issue #20）。
 *
 * 一张卡可能呈现两件事，取决于服务端判定的 `mode`：
 * - **订阅**（subscription / both）：周期额度窗口（W 语义，每周期重置）
 * - **钱包**（wallet）：充值余额（B 语义，只减不重置）
 *
 * 额度单位由服务端读站点 `/api/status` 的 `quota_display_type` 得出（USD / CNY / CUSTOM / TOKENS），
 * 数值已按站点设置折算，因此这里的 `unit` 直接采用服务端给的**符号**；
 * 账单接口回落时 `currency` 为 null —— 币种无法反推，此时不显示任何单位、只作相对参考，
 * 并在卡面与弹窗都说明这一点（否则用户会以为数字算错了）。
 */
import type {
  AccountDetail,
  AccountIdentity,
  DataTable,
  Metric,
  NewApiAccountData,
  NewApiQuotaUnit,
  NewApiSubscription,
  WindowQuota,
} from '../types'
import {
  countMetric,
  field,
  identityFields,
  link,
  notice,
  table,
  unitMoneyMetric,
  windowQuota,
  withSite,
} from '../detail'
import { formatCount, formatMoney } from '../format'
import { formatDateTime } from '../utils'

type NewApiAccount = NewApiAccountData & AccountIdentity

/** 站点给的额度符号（$ / ¥ / 自定义符号 / 点）；账单接口回落时为 undefined。 */
function currencyUnit(currency: NewApiQuotaUnit | null): string | undefined {
  return currency?.unit || undefined
}

/** 详情弹窗里的「额度单位」说明：类型 + 符号（账单接口回落时币种未知）。 */
function currencyLabel(currency: NewApiQuotaUnit | null): string {
  if (!currency) {
    return '未知（账单接口返回，币种由站点折算，无法反推）'
  }
  const names: Record<NewApiQuotaUnit['type'], string> = {
    USD: '美元',
    CNY: '人民币',
    CUSTOM: '站点自定义货币',
    TOKENS: '点数（按 quota 原值展示）',
  }
  return `${names[currency.type]}（${currency.unit}）`
}

function modeLabel(account: NewApiAccount): string {
  if (account.mode === 'subscription') {
    return '订阅计费'
  }
  if (account.mode === 'both') {
    return `订阅 + 钱包（${account.billingPreference ?? '未指定优先'}）`
  }
  return '钱包计费'
}

function dateTime(value: number | null): string {
  return value ? formatDateTime(value) : '—'
}

/** 周期长度：订阅周期多为 7 / 30 天，站点可自定义；取不到就不写这一句。 */
function cycleNote(sub: NewApiSubscription): string | undefined {
  if (!sub.lastResetAt || !sub.nextResetAt) {
    return undefined
  }
  const days = (sub.nextResetAt - sub.lastResetAt) / 86_400_000
  return days >= 1 ? `周期 ${formatCount(days)} 天` : `周期 ${formatCount(days * 24)} 小时`
}

/** 订阅窗口：按金额计的额度，`countKind: 'money'` 决定 2 位截断（缺省的 tokens 会把 12.00 缩写成 12）。 */
function subscriptionWindow(sub: NewApiSubscription, unit: string | undefined): WindowQuota {
  return windowQuota({
    key: 'subscription',
    label: '本周期额度',
    percent: sub.percent,
    used: sub.used,
    total: sub.total,
    remaining: sub.remain,
    resetAt: sub.nextResetAt,
    unit,
    countKind: 'money',
    note: cycleNote(sub),
  })
}

/** 钱包余额读数（B 语义）：无限额度时给文本读数，而不是伪造一个 0。 */
function walletBalances(account: NewApiAccount, unit: string | undefined): Metric[] {
  const wallet = account.wallet
  if (!wallet) {
    return []
  }
  const balance: Metric = wallet.unlimited
    ? { key: 'wallet-remain', label: '钱包余额', value: '无限额度', kind: 'text' }
    : {
        ...unitMoneyMetric('wallet-remain', '钱包余额', wallet.remain, unit),
        ...((wallet.remain ?? 0) < 1 ? { tone: 'danger' as const } : {}),
      }
  return [balance, unitMoneyMetric('wallet-used', '累计已用', wallet.used, unit)]
}

/** 钱包计数读数（其余主读数）：只有上游给了请求数才渲染这一格。 */
function walletCounts(account: NewApiAccount): Metric[] {
  const count = account.wallet?.requestCount
  return count === null || count === undefined
    ? []
    : [countMetric('wallet-requests', '累计请求数', count)]
}

function modelTable(account: NewApiAccount, unit: string | undefined): DataTable {
  return table(
    '窗口内按模型用量',
    [
      { key: 'model', label: '模型' },
      { key: 'quota', label: '额度', align: 'right' },
      { key: 'usage', label: '请求 / Tokens', align: 'right' },
    ],
    account.models.map((model) => ({
      _key: model.model,
      model: model.model,
      quota: formatMoney(model.quota, unit),
      usage: `${formatCount(model.requests)} 次 · ${formatCount(model.tokens)} tokens`,
    })),
  )
}

export function toNewApiDetail(account: NewApiAccount): AccountDetail {
  const unit = currencyUnit(account.currency)
  const subscription = account.subscription
  const quotaRemain = account.wallet?.quotaRemain
  return {
    identity: withSite(identityFields(account, 'NEWAPI_LABEL / NEWAPI_LABEL_N'), account.baseUrl),
    // 卡头标签只表达「这张卡为什么归当前 Tab」：订阅 / 钱包是跨平台同义的分类
    badge: {
      label: subscription ? '订阅' : '钱包',
      theme: subscription ? 'primary' : 'default',
    },
    windows: subscription ? [subscriptionWindow(subscription, unit)] : [],
    balances: walletBalances(account, unit),
    metrics: walletCounts(account),
    tables: [modelTable(account, unit)],
    meta: [
      field('用户名', account.username),
      field('分组', account.group),
      field('计费模式', modeLabel(account)),
      field(
        '数据来源',
        account.source === 'api' ? '管理接口（系统访问令牌）' : '账单接口（API Key）',
      ),
      field('额度单位', currencyLabel(account.currency)),
      field('统计窗口', `${dateTime(account.windowStart)} → ${dateTime(account.windowEnd)}`),
      ...(subscription
        ? [
            field('订阅有效期至', dateTime(subscription.endAt)),
            field('额度用尽后回落钱包', subscription.allowWalletOverflow ? '允许' : '不允许'),
          ]
        : []),
      ...(quotaRemain === null || quotaRemain === undefined
        ? []
        : [
            field(
              '钱包原始 quota',
              `${formatCount(quotaRemain)} / ${formatCount(account.wallet?.quotaUsed ?? 0)}`,
            ),
          ]),
      ...(account.stats
        ? [
            field(
              '每分钟请求 / Token',
              `${formatCount(account.stats.rpm)} / ${formatCount(account.stats.tpm)}`,
            ),
          ]
        : []),
    ],
    links: [
      link('控制台', account.consoleUrl, 'console'),
      link('可用模型', account.modelsUrl, 'models'),
    ],
    notices: account.currency
      ? []
      : [
          {
            ...notice(
              'info',
              '站点未提供额度口径（走的是账单接口），读数不带货币符号，仅作相对参考',
            ),
            // 卡面上也要说明：否则用户会把「没有货币符号」当成数字算错了
            cardFace: true,
          },
        ],
  }
}
