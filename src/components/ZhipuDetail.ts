/**
 * 智谱 GLM → 统一展示模型（issue #20）。
 *
 * 三个子接口（Coding Plan 额度 / 余额 / 资源包）各自独立容错，因此这里也是
 * **逐切片**落位：任一路失败只让对应分区消失并附一条告警，其余照常。
 *
 * `variant` 决定**卡面**显示哪一半：同一个账号既属于「套餐订阅」Tab（窗口）
 * 也属于「余额账户」Tab（余额），两张卡各展示一半 —— 用 `cardFace` 表达，
 * 而不是让两个组件各自挑字段（那就是 10 种摆法的起点）。
 */
import type {
  AccountDetail,
  AccountIdentity,
  Metric,
  ZhipuAccountBalance,
  ZhipuCodingPlanQuota,
  ZhipuPackagesData,
  ZhipuQuotaWindow,
  ZhipuTokenPackage,
} from '../types'
import {
  countMetric,
  field,
  identityFields,
  link,
  moneyField,
  moneyMetric,
  notice,
  table,
  windowQuota,
} from '../detail'
import { formatTokens } from '../format'

type ZhipuAccount = ZhipuPackagesData & AccountIdentity

const WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  weekly: '每周窗口',
}

/** 信用支付状态（上游枚举）。 */
function creditStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ENABLE: '已开通',
    NOT_OPEN: '未开通',
    DISABLE: '已关闭',
  }
  return labels[status] ?? status
}

/** 资源包类型（上游枚举）。 */
function packageTypeLabel(type: string): string {
  const labels: Record<string, string> = { pay: '付费', give: '赠送' }
  return labels[type] ?? type
}

/** 只列生效中的资源包：已过期/已用尽的不进表，数量靠标题里的计数表达。 */
function activePackages(packages: ZhipuTokenPackage[]): ZhipuTokenPackage[] {
  return packages.filter((pkg) => pkg.status === 'EFFECTIVE' || pkg.status === 'NOTUSED')
}

function codingWindows(codingPlan: ZhipuCodingPlanQuota, cardFace: boolean) {
  return codingPlan.windows.map((window: ZhipuQuotaWindow) =>
    windowQuota({
      key: window.window,
      label: WINDOW_LABELS[window.window] ?? window.window,
      percent: window.percentage,
      used: window.used,
      total: window.total,
      remaining: window.remaining,
      resetAt: window.nextResetTime,
      cardFace,
    }),
  )
}

function balanceMetrics(balance: ZhipuAccountBalance, cardFace: boolean): Metric[] {
  const face = cardFace ? {} : { cardFace: false as const }
  return [
    { ...moneyMetric('available', '可用余额', balance.availableBalance, 'CNY'), ...face },
    { ...moneyMetric('balance', '账户余额', balance.balance, 'CNY'), ...face },
  ]
}

function packageTable(packages: ZhipuTokenPackage[]) {
  const rows = activePackages(packages)
  return table(
    '资源包',
    [
      { key: 'name', label: '资源包' },
      { key: 'type', label: '类型' },
      { key: 'total', label: '总额', align: 'right' },
      { key: 'remaining', label: '剩余', align: 'right' },
      { key: 'expire', label: '到期时间' },
    ],
    rows.map((pkg) => ({
      _key: String(pkg.id),
      // 场景后缀进括号：同一类资源包会按场景拆成多条，只显示名字看不出差别
      name: pkg.suitableScene
        ? `${pkg.resourcePackageName}（${pkg.suitableScene}）`
        : pkg.resourcePackageName,
      type: packageTypeLabel(pkg.type),
      total: formatTokens(pkg.tokensMagnitude),
      remaining: formatTokens(pkg.availableBalance),
      expire: pkg.packageExpirationTime ? pkg.packageExpirationTime.replace('T', ' ') : '—',
    })),
  )
}

export function toZhipuDetail(account: ZhipuAccount, variant: 'plan' | 'balance'): AccountDetail {
  const planCard = variant !== 'balance'
  const codingPlan = 'data' in account.codingPlan ? account.codingPlan.data : null
  const balance = 'data' in account.balance ? account.balance.data : null
  const packages = 'data' in account.packages ? account.packages.data : []
  return {
    identity: identityFields(account, 'ZHIPU_LABEL / ZHIPU_LABEL_N'),
    windows: codingPlan ? codingWindows(codingPlan, planCard) : [],
    balances: balance ? balanceMetrics(balance, !planCard) : [],
    metrics: [
      {
        ...countMetric('packages', '生效资源包', activePackages(packages).length),
        ...(planCard ? { cardFace: false as const } : {}),
      },
    ],
    tables: [packageTable(packages)],
    meta: [
      field('Coding Plan 等级', codingPlan?.level ?? null),
      ...(balance
        ? [
            field('信用支付', creditStatusLabel(balance.creditStatus)),
            moneyField('累计充值', balance.rechargeAmount, 'CNY'),
            moneyField('赠送金额', balance.giveAmount, 'CNY'),
          ]
        : []),
    ],
    links: [link('控制台用量页', 'https://www.bigmodel.cn/coding-plan/personal/usage', 'console')],
    // 失败告警只在**属于这张卡**的时候出现（套餐卡的弹窗里不该有余额接口的错误）；
    // 卡面负责的那一半失败时必须上卡面 —— 否则用户看到的是「空卡 + 没有解释」。
    notices: [
      ...('error' in account.codingPlan && planCard
        ? [
            {
              ...notice('warn', `Coding Plan 额度查询失败：${account.codingPlan.error}`),
              cardFace: true,
            },
          ]
        : []),
      ...('error' in account.balance && !planCard
        ? [
            {
              ...notice('warn', `账户余额查询失败：${account.balance.error}`),
              cardFace: true,
            },
          ]
        : []),
      ...('error' in account.packages
        ? [notice('warn', `资源包查询失败：${account.packages.error}`)]
        : []),
    ],
  }
}
