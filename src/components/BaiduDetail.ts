/**
 * 百度千帆 → 统一展示模型（issue #20）。
 *
 * 卡面是近 7 天的用量三项；量包明细与 TPM 配额进 ③ 两张表。
 */
import type {
  AccountDetail,
  AccountIdentity,
  DataTable,
  Metric,
  QianfanData,
  QianfanPackage,
  QianfanTpmQuota,
} from '../types'
import { countMetric, identityFields, table, tokenMetric } from '../detail'
import { formatCount } from '../format'

type BaiduAccount = QianfanData & AccountIdentity

/** 上游状态 → 中文（表列用）；未收录的原样回退，不隐藏信息。 */
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    Pending: '待使用',
    Active: '使用中',
    Exhausted: '已用尽',
    Expired: '已过期',
    Running: '运行中',
    Creating: '创建中',
    Stopped: '已停止',
  }
  return labels[status] ?? status
}

function formatTime(iso: string): string {
  return iso ? iso.replace('T', ' ').replace(/Z$/, '') : '—'
}

function packageTable(packages: QianfanPackage[]): DataTable {
  return table(
    '量包明细',
    [
      { key: 'serviceName', label: '量包' },
      { key: 'specification', label: '总量', align: 'right' },
      { key: 'used', label: '已用', align: 'right' },
      { key: 'expiredTime', label: '到期时间' },
      { key: 'status', label: '状态', kind: 'status' },
    ],
    packages.map((pkg) => ({
      _key: pkg.packageId,
      serviceName: pkg.serviceName,
      specification: pkg.specification,
      used: pkg.used,
      expiredTime: formatTime(pkg.expiredTime),
      status: statusLabel(pkg.status),
    })),
    // 空态要说清「下一步去哪买」，模板生成不出来
    { emptyText: '无量包（可在千帆控制台购买 Token 量包）' },
  )
}

function tpmTable(quotas: QianfanTpmQuota[]): DataTable {
  return table(
    'TPM 配额',
    [
      { key: 'model', label: '模型' },
      { key: 'tpm', label: 'TPM 配额', align: 'right' },
      { key: 'paymentTiming', label: '付费' },
      { key: 'status', label: '状态', kind: 'status' },
    ],
    quotas.map((quota) => ({
      _key: quota.instanceId,
      model: quota.model,
      tpm: formatCount(quota.tpm),
      paymentTiming: quota.paymentTiming === 'Postpaid' ? '后付费' : quota.paymentTiming,
      status: statusLabel(quota.status),
    })),
  )
}

export function toBaiduDetail(account: BaiduAccount): AccountDetail {
  // ①「活跃服务」② 调用次数 按计数精度（0 位 + 千分位）；tokens 走量级缩写
  const metrics: Metric[] = [
    tokenMetric('usage-tokens', '量包（近 7 天用量）', account.usage.totalTokens),
    countMetric('usage-calls', '调用次数', account.usage.totalCalls),
    countMetric('usage-services', '活跃服务', account.usage.serviceCount),
  ]
  return {
    identity: identityFields(account, 'BAIDU_LABEL / BAIDU_LABEL_N'),
    metrics,
    balances: [],
    windows: [],
    tables: [packageTable(account.packages), tpmTable(account.tpmQuotas)],
    meta: [],
    links: [],
    notices: [],
  }
}
