/**
 * 阿里云百炼 Token Plan → 统一展示模型（issue #20）。
 *
 * 个人版窗口来自**独立容错切片**（`personal`）：查询失败时窗口区整体消失，
 * 但组织 / 座席 / 共享包照常展示，并在 ④ 附一条告警说明原因。
 */
import type {
  AccountDetail,
  AccountIdentity,
  DataTable,
  Field,
  Metric,
  TokenPlanAccount,
  TokenPlanEquity,
  TokenPlanPersonalPlan,
  TokenPlanPersonalWindow,
  TokenPlanResetCard,
  TokenPlanSeat,
  TokenPlanSharedPackage,
  WindowQuota,
} from '../types'
import { countMetric, field, identityFields, notice, table, windowQuota } from '../detail'
import { formatTokens } from '../format'
import { formatDateTime } from '../utils'

/** 服务端下发的账号数据（`personal` 是独立容错切片）。 */
export interface TokenPlanData {
  account: TokenPlanAccount | null
  seats: { items: TokenPlanSeat[]; total: number } | null
  sharedPackages: { items: TokenPlanSharedPackage[]; total: number } | null
  personal: { data: TokenPlanPersonalPlan } | { error: string }
}

type TokenPlanAccountData = TokenPlanData & AccountIdentity

/** 权益周期（上游给的是**秒**）。 */
function cycleLabel(equity: TokenPlanEquity | undefined): string {
  if (!equity || !equity.cycleStartTime || !equity.cycleEndTime) {
    return '—'
  }
  const start = new Date(equity.cycleStartTime * 1000).toLocaleDateString('zh-CN')
  const end = new Date(equity.cycleEndTime * 1000).toLocaleDateString('zh-CN')
  return `${start} ~ ${end}`
}

/** 重置卡汇总：张数 + 最近到期时间（无有效期信息时只给张数）。 */
function resetCardSummary(cards: TokenPlanResetCard[]): string {
  const expiries = cards.map((card) => card.expiresAt).filter((value) => value > 0)
  if (expiries.length === 0) {
    return `${cards.length} 张`
  }
  return `${cards.length} 张（最近 ${formatDateTime(Math.min(...expiries))} 到期）`
}

/** 个人版用量窗口：5 小时窗口官方取消后不渲染，7 天窗口恒展示。 */
function personalWindows(personal: TokenPlanPersonalPlan): WindowQuota[] {
  const windows: WindowQuota[] = []
  if (personal.fiveHour) {
    windows.push(personalWindow('fiveHour', '5 小时窗口', personal.fiveHour))
  }
  windows.push(personalWindow('weekly', '7 天窗口', personal.weekly))
  return windows
}

function personalWindow(key: string, label: string, window: TokenPlanPersonalWindow): WindowQuota {
  // 上游只给百分比 → 数值行退化成「已用 N%」
  return windowQuota({ key, label, percent: window.percent, resetAt: window.resetTime })
}

/** 个人版套餐元信息（订阅 / 数据来源 / 重置卡 / 加购包）。 */
function personalMeta(personal: TokenPlanPersonalPlan): Field[] {
  const fields: Field[] = [
    field('数据来源', personal.source === 'cookie' ? '会话 Cookie' : 'AK/SK'),
  ]
  // 没有重置卡就不渲染这一行：挂一个「—」只会让读者以为数据丢了
  if (personal.resetCards.length > 0) {
    fields.push(field('重置卡', resetCardSummary(personal.resetCards)))
  }
  const subscription = personal.subscription
  if (subscription) {
    fields.push(
      field('套餐', subscription.specCode),
      field('实例', subscription.instanceCode || null),
      field('订阅状态', subscription.status),
      field('自动续费', subscription.autoRenewFlag ? '已开启' : '未开启'),
      field(
        '订阅周期',
        `${formatDateTime(subscription.startTime)} ~ ${formatDateTime(subscription.endTime)}`,
        { span: 2 },
      ),
    )
  }
  const addon = personal.addon
  if (addon && (addon.totalCredits > 0 || addon.activeCount > 0)) {
    fields.push(
      field('加购包生效数', addon.activeCount),
      field('加购包总量', creditText(addon.totalCredits)),
      field('加购包剩余', creditText(addon.remainingCredits)),
    )
  }
  return fields
}

/** CREDITS 是**额度单位**不是货币：走量级缩写 + 单位文本，不套金额的 2 位精度。 */
function creditText(value: number): string {
  return `${formatTokens(value)} CREDITS`
}

/**
 * 剩余天数：属于**订阅**的有效期，不是用量窗口 —— 因此不进卡面。
 *
 * 卡面已经是「两个窗口 + 各自倒计时」，再塞一个「还剩多少天」会让读者以为
 * 它也是某个可耗尽的额度（实际它会自己往前走，与用量无关）。
 */
function remainingDaysMetric(days: number): Metric {
  return { ...countMetric('remaining-days', '剩余天数', days, '天'), cardFace: false }
}

function seatTable(seats: TokenPlanSeat[]): DataTable {
  return table(
    '订阅座席',
    [
      { key: 'instance', label: '实例' },
      { key: 'spec', label: '规格' },
      { key: 'cycle', label: '额度周期' },
      { key: 'total', label: '总额度 (CREDITS)', align: 'right' },
      { key: 'remaining', label: '剩余 (CREDITS)', align: 'right' },
      { key: 'status', label: '状态', kind: 'status' },
    ],
    seats.map((seat) => {
      const equity = seat.equityList[0]
      return {
        _key: seat.seatId,
        instance: seat.instanceCode,
        spec: seat.specType,
        cycle: cycleLabel(equity),
        total: formatTokens(equity?.cycleTotalValue ?? 0),
        remaining: formatTokens(equity?.cycleSurplusValue ?? 0),
        status: seat.status || '—',
      }
    }),
  )
}

function packageTable(packages: TokenPlanSharedPackage[]): DataTable {
  return table(
    '共享包',
    [
      { key: 'instance', label: '实例' },
      { key: 'cycle', label: '额度周期' },
      { key: 'total', label: '总额度 (CREDITS)', align: 'right' },
      { key: 'remaining', label: '剩余 (CREDITS)', align: 'right' },
      { key: 'status', label: '状态', kind: 'status' },
    ],
    packages.map((pkg) => {
      const equity = pkg.equityList[0]
      return {
        _key: pkg.instanceCode,
        instance: pkg.instanceCode,
        cycle: cycleLabel(equity),
        total: formatTokens(equity?.cycleTotalValue ?? 0),
        remaining: formatTokens(equity?.cycleSurplusValue ?? 0),
        status: pkg.status || '—',
      }
    }),
  )
}

export function toTokenPlanDetail(account: TokenPlanAccountData): AccountDetail {
  const personal = 'data' in account.personal ? account.personal.data : null
  const tables: DataTable[] = []
  if (account.seats) {
    tables.push(seatTable(account.seats.items))
  }
  if (account.sharedPackages) {
    tables.push(packageTable(account.sharedPackages.items))
  }
  return {
    identity: identityFields(account, 'ALIYUN_LABEL / ALIYUN_TOKENPLAN_LABEL'),
    windows: personal ? personalWindows(personal) : [],
    balances: [],
    metrics: personal?.subscription
      ? [remainingDaysMetric(personal.subscription.remainingDays)]
      : [],
    tables,
    meta: [
      ...(account.account
        ? [
            field('账号类型', account.account.accountType || 'ALIYUN'),
            field('账号名称', account.account.name || account.account.accountId),
            field('UID', account.account.aliyunUid),
            field('组织数', account.account.orgs.length),
          ]
        : [
            // 只有会话 Cookie 时没有组织视图，说清「为什么这里没有座席表」
            field('凭据', '仅配置会话 Cookie（未配置 AK/SK，无组织/座席视图）', { span: 2 }),
          ]),
      ...(personal ? personalMeta(personal) : []),
    ],
    links: [],
    notices:
      'error' in account.personal
        ? [
            {
              ...notice('error', `个人版用量查询失败：${account.personal.error}`),
              // 卡面上的高优先级信息就是窗口，窗口没了必须第一眼说明原因
              cardFace: true,
            },
          ]
        : [],
  }
}
