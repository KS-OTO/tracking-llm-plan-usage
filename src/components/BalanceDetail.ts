/**
 * 通用余额平台 → 统一展示模型（StepFun / SiliconFlow / Novita AI / Sub2API）。
 *
 * 这些平台的核心维度一致：剩余额度 +（可选）总额 / 已用 + 币种。
 * 上游额外给出的现金 / 赠金 / 信用额度等维度统一进详情弹窗，卡面只保留主读数。
 */
import type { AccountDetail, AccountIdentity, SimpleBalanceData } from '../types'
import { field, identityFields, moneyField, moneyMetric, textMetric } from '../detail'
import { currencySymbol } from '../format'

type BalanceAccount = SimpleBalanceData & AccountIdentity

export function toBalanceDetail(account: BalanceAccount): AccountDetail {
  return {
    identity: identityFields(account, '*_LABEL / *_LABEL_N'),
    windows: [],
    balances:
      account.balance === null
        ? []
        : [
            {
              key: 'balance',
              label: '剩余额度',
              value: account.balance,
              kind: 'money',
              unit: currencySymbol(account.unit),
            },
          ],
    metrics: [
      ...(account.balance === null
        ? [textMetric('quota', '额度', account.plan ? `${account.plan}（不限量）` : '不限量')]
        : []),
      ...(account.total === undefined
        ? []
        : [moneyMetric('total', '总额度', account.total, account.unit)]),
      ...(account.used === undefined
        ? []
        : [moneyMetric('used', '已用', account.used, account.unit)]),
    ],
    tables: [],
    meta: [
      field('平台', account.provider),
      ...(account.plan ? [field('套餐', account.plan)] : []),
      ...(account.details ?? []).map((detail) =>
        moneyField(detail.label, detail.value, detail.unit),
      ),
      ...(account.meta ?? []).map((item) => field(item.label, item.value)),
    ],
    links: [],
    notices: [],
  }
}
