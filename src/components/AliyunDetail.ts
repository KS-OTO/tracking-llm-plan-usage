/**
 * 阿里云百炼资源包 → 统一展示模型（issue #20）。
 *
 * 卡面只有两个计数读数（实例总数 / 可用实例），资源包明细进 ③ 表。
 */
import type {
  AccountDetail,
  AccountIdentity,
  AliyunResourcePackage,
  DataTable,
  Metric,
} from '../types'
import { countMetric, identityFields, table } from '../detail'

/** 服务端把「资源包列表 + 总数」作为一个整体下发。 */
export interface AliyunPackagesData {
  packages: AliyunResourcePackage[]
  totalCount: number
}

type AliyunAccount = AliyunPackagesData & AccountIdentity

/** 资源包名：商品码优先，退到包类型，最后才用实例 ID（实例 ID 对人基本不可读）。 */
function packageName(pkg: AliyunResourcePackage): string {
  return pkg.commodityCode || pkg.packageType || pkg.instanceId
}

/** 「总量」这类读数上游给的是「数值 + 单位」两段文本，拼接后交给表格原样显示。 */
function amountText(value: string, unit: string): string {
  return unit ? `${value} ${unit}` : value
}

function periodText(pkg: AliyunResourcePackage): string {
  if (!pkg.effectiveTime && !pkg.expiryTime) {
    return '—'
  }
  return `${pkg.effectiveTime || '—'} ~ ${pkg.expiryTime || '—'}`
}

function packageTable(packages: AliyunResourcePackage[]): DataTable {
  return table(
    '资源包明细',
    [
      { key: 'name', label: '资源包' },
      { key: 'total', label: '总量', align: 'right' },
      { key: 'remaining', label: '剩余', align: 'right' },
      { key: 'region', label: '地域' },
      { key: 'period', label: '有效期' },
      { key: 'status', label: '状态', kind: 'status' },
    ],
    packages.map((pkg) => ({
      _key: pkg.instanceId,
      name: packageName(pkg),
      total: amountText(pkg.totalAmount, pkg.totalAmountUnit),
      remaining: amountText(pkg.remainingAmount, pkg.remainingAmountUnit),
      region: pkg.region || '—',
      period: periodText(pkg),
      status: pkg.status || '—',
    })),
    { emptyText: '该账号下没有资源包实例' },
  )
}

export function toAliyunDetail(account: AliyunAccount): AccountDetail {
  const available = account.packages.filter((pkg) => pkg.status === 'Available').length
  const metrics: Metric[] = [
    countMetric('instances', '资源包实例', account.totalCount),
    countMetric('available', '可用实例', available),
  ]
  return {
    identity: identityFields(account, 'ALIYUN_LABEL / ALIYUN_LABEL_N'),
    metrics,
    balances: [],
    windows: [],
    tables: [packageTable(account.packages)],
    meta: [
      // 「适用产品」是逐包属性，不适合塞进全局字段区，取所有包的去重并集
      { label: '适用产品', value: productsOf(account.packages), span: 2 },
    ],
    links: [],
    notices: [],
  }
}

/** 所有资源包适用产品的并集（去重、顿号分隔）；没有则给占位。 */
function productsOf(packages: AliyunResourcePackage[]): string {
  const products = [...new Set(packages.flatMap((pkg) => pkg.applicableProducts ?? []))]
  return products.length > 0 ? products.join('、') : '—'
}
