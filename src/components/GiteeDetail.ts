/**
 * 模力方舟（Gitee AI）→ 统一展示模型（issue #20）。
 *
 * 卡面是余额三项；资源包明细与代金券（余额 + 券明细）进 ③ 两张表 ——
 * 代金券的两个余额挂在「代金券表」的 `summary` 上，而**不是**账号级读数：
 * 它们只对这张表里的券成立，放上卡面会让余额卡凭空多出两个数字。
 */
import type {
  AccountDetail,
  AccountIdentity,
  GiteePackageBalance,
  GiteePackageDetail,
  GiteeVoucher,
  GiteeVoucherCoupon,
  Metric,
} from '../types'
import { identityFields, moneyMetric, table, tokenMetric } from '../detail'
import { formatCurrency } from '../format'

type GiteeAccount = GiteePackageBalance & AccountIdentity

/** 模力方舟一律 CNY：卡面用符号（`currencySymbol`），弹窗字段里才出现代码。 */
const CURRENCY = 'CNY'

function formatDate(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleDateString('zh-CN') : '—'
}

/** 券状态：过期 / 可用 / 已用尽（判定与卡片上的标签一致，不另立一套）。 */
function couponStatus(coupon: GiteeVoucherCoupon): string {
  if (coupon.expiredAt > 0 && coupon.expiredAt <= Date.now()) {
    return '已过期'
  }
  return coupon.balance > 0 ? '可用' : '已用尽'
}

function voucherSummary(voucher: GiteeVoucher): Metric[] {
  return [
    moneyMetric('voucher-cash', '现金代金券余额', voucher.couponCashBalance, CURRENCY),
    tokenMetric('voucher-compute', '算力代金券余额', voucher.couponComputeBalance, 'token'),
  ]
}

function resourceTable(details: GiteePackageDetail[]) {
  return table(
    '资源包明细',
    [
      { key: 'name', label: '资源包' },
      { key: 'amount', label: '总金额', align: 'right' },
      { key: 'balance', label: '余额', align: 'right' },
    ],
    details.map((detail) => ({
      _key: detail.ident,
      name: detail.name || detail.ident || '未命名资源包',
      amount: formatCurrency(detail.amount, CURRENCY),
      balance: formatCurrency(detail.balance, CURRENCY),
    })),
  )
}

function voucherTable(voucher: GiteeVoucher) {
  return table(
    `代金券 · ${voucher.namespace}`,
    [
      { key: 'catalog', label: '代金券' },
      { key: 'amount', label: '面额', align: 'right' },
      { key: 'balance', label: '剩余', align: 'right' },
      { key: 'expiredAt', label: '过期时间' },
      { key: 'status', label: '状态', kind: 'status' },
    ],
    voucher.coupons.map((coupon) => ({
      _key: coupon.id,
      // 券名后面缀上服务类型：同一张券适用多种服务时，只显示券名看不出用途
      catalog:
        coupon.serviceTypes.length > 0
          ? `${coupon.catalog}（${coupon.serviceTypes.join(' / ')}）`
          : coupon.catalog,
      amount: formatCurrency(coupon.amount, CURRENCY),
      balance: formatCurrency(coupon.balance, CURRENCY),
      expiredAt: formatDate(coupon.expiredAt),
      status: couponStatus(coupon),
    })),
    { summary: voucherSummary(voucher) },
  )
}

export function toGiteeDetail(account: GiteeAccount): AccountDetail {
  const voucher = account.voucher
  const voucherOk = voucher !== undefined && 'data' in voucher
  return {
    identity: identityFields(account, 'GITEE_LABEL / GITEE_LABEL_N'),
    balances: [
      moneyMetric('balance', '剩余余额', account.balance, CURRENCY),
      moneyMetric('used', '已使用', account.usedAmount, CURRENCY),
      moneyMetric('total', '总金额', account.totalAmount, CURRENCY),
    ],
    metrics: [],
    windows: [],
    tables: [resourceTable(account.details), ...(voucherOk ? [voucherTable(voucher.data)] : [])],
    meta: voucherOk ? [{ label: '代金券命名空间', value: voucher.data.namespace }] : [],
    links: [],
    notices:
      voucher !== undefined && 'error' in voucher
        ? [{ level: 'warn' as const, text: `代金券查询失败：${voucher.error}` }]
        : [],
  }
}
