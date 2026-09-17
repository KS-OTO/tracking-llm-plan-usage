/**
 * DeepSeek 余额 → 统一展示模型（issue #20）。
 *
 * 这里只做「原始字段 → 分区」的搬运：精度、单位、危险色一概交给
 * `ui/MetricTile` 与 `detail.ts` 的构造函数，适配器里不出现任何 `toFixed`。
 */
import type { AccountDetail, AccountIdentity, BalanceEntry, DeepSeekBalance, Field } from '../types'
import { identityFields, moneyField, moneyMetric, field } from '../detail'

type DeepSeekAccount = DeepSeekBalance & AccountIdentity

/** 总余额：按币种一个读数（卡面只显示符号，币种代码留在弹窗的拆分字段里）。 */
function balanceMetric(entry: BalanceEntry) {
  return moneyMetric(`balance-${entry.currency}`, '总余额', entry.total, entry.currency)
}

/**
 * 充值 / 赠金拆分作为 ③ 字段而不是读数瓦片：它们是**拆解**而非并列读数，
 * 用 descriptions 的三组「币种 + 项目」比三个大字更省空间，也不会与总余额抢视觉重心。
 */
function breakdownFields(entry: BalanceEntry): Field[] {
  return [
    moneyField(`${entry.currency} 充值`, entry.toppedUp, entry.currency),
    moneyField(`${entry.currency} 赠金`, entry.granted, entry.currency),
  ]
}

export function toDeepSeekDetail(account: DeepSeekAccount): AccountDetail {
  return {
    identity: identityFields(account, 'DEEPSEEK_LABEL / DEEPSEEK_LABEL_N'),
    // 卡头标签只表达**异常态**：正常态人人可用，挂满「可用」只会稀释信息
    ...(account.isAvailable ? {} : { badge: { label: '不可用', theme: 'warning' as const } }),
    balances: account.balances.map(balanceMetric),
    metrics: [],
    windows: [],
    tables: [],
    meta: [
      field('可用状态', account.isAvailable ? '可用' : '不可用'),
      ...account.balances.flatMap(breakdownFields),
    ],
    links: [],
    notices: [],
  }
}
