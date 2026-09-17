/**
 * 展示模型（`AccountDetail`）的**构件库**（issue #20）。
 *
 * 10 个平台的适配器共用这里的构造函数，于是同一类读数在 10 份适配器里写法一致 ——
 * 尤其是「精度由语义决定」（#19）：适配器只声明 `kind`，绝不自己 `toFixed`。
 *
 * 例：`moneyMetric('balance', '账户余额', 56.7, 'CNY')` → 卡面上渲染成 `56.70 ¥`。
 */
import type {
  AccountCard,
  AccountDetail,
  AccountDetailAdapter,
  AccountEnvelope,
  AccountIdentity,
  DataTable,
  Field,
  LinkField,
  Metric,
  Notice,
  WindowQuota,
} from './types'
import { toAccountCard } from './types'
import { currencySymbol, EMPTY_VALUE, formatCurrency } from './format'
import { formatDateTime, formatReset } from './utils'

/** 字段值缺失时的统一占位（空串、null、undefined 都算缺失）。 */
export function fieldText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return EMPTY_VALUE
  }
  return typeof value === 'string' && value === '' ? EMPTY_VALUE : String(value)
}

/**
 * ③ 扩展字段。
 *
 * `span` 只在**字段值确实很长**时置 2（如一行 URL / 枚举串），
 * 而不是为了让某一节「看起来满」整表降成 1 列 —— 那会让其余平台的弹窗节奏全变。
 */
export function field(
  label: string,
  value: string | number | null | undefined,
  options: { hint?: string; span?: 1 | 2 } = {},
): Field {
  const text = fieldText(value)
  return {
    label,
    value: text,
    ...(options.hint ? { hint: options.hint } : {}),
    ...(options.span ? { span: options.span } : {}),
  }
}

/** 布尔字段：「是 / 否」，缺值给占位。 */
export function flag(label: string, value: boolean | null | undefined): Field {
  if (value === null || value === undefined) {
    return field(label, null)
  }
  return field(label, value ? '是' : '否')
}

/**
 * ① 身份区两项。**全站统一标签：别名 / Key。**
 *
 * 曾经的三种叫法（「别名 / 密钥名」OpenRouter、「用户名」New API）让人以为
 * 是三种不同的东西；平台自己的叫法放 `meta` 里保留。
 */
export function identityFields(account: AccountIdentity, envHint: string): Field[] {
  return [
    field('别名', account.label || `未配置（用 ${envHint} 设置）`),
    field('Key', account.keyHint),
  ]
}

/** 追加「站点」等身份项（自托管平台的主身份其实是站点域名）。 */
export function withSite(identity: Field[], site: string | null | undefined): Field[] {
  return site ? [...identity, field('站点', site)] : identity
}

/** 金额读数（2 位截断；`unit` 由币种代码推出符号）。 */
export function moneyMetric(
  key: string,
  label: string,
  value: number | null,
  currency?: string | null,
): Metric {
  return { key, label, value, kind: 'money', unit: currencySymbol(currency) }
}

/** 已带符号的金额读数（站点自定义口径，符号由上游给）。 */
export function unitMoneyMetric(
  key: string,
  label: string,
  value: number | null,
  unit: string | undefined,
): Metric {
  return { key, label, value, kind: 'money', ...(unit ? { unit } : {}) }
}

/** 计数读数（0 位 + 千分位）。 */
export function countMetric(
  key: string,
  label: string,
  value: number | null,
  unit?: string,
): Metric {
  return { key, label, value, kind: 'count', ...(unit ? { unit } : {}) }
}

/** Token / 量级读数（12.5K / 1.20M）。 */
export function tokenMetric(
  key: string,
  label: string,
  value: number | null,
  unit?: string,
): Metric {
  return { key, label, value, kind: 'tokens', ...(unit ? { unit } : {}) }
}

/** 比率读数（1 位四舍五入）。 */
export function percentMetric(key: string, label: string, value: number | null): Metric {
  return { key, label, value, kind: 'percent', unit: '%' }
}

/** 文本读数（枚举、日期文案）。 */
export function textMetric(key: string, label: string, value: string | null): Metric {
  return { key, label, value: value === '' ? null : value, kind: 'text' }
}

/** 金额字段文本（弹窗用；带币种代码的是 `meta`，与卡面的符号不冲突）。 */
export function moneyField(
  label: string,
  value: number | null | undefined,
  code?: string | null,
): Field {
  return field(label, value === null || value === undefined ? null : formatCurrency(value, code))
}

/**
 * 明细表：行由适配器格式化好，`_key` 自动补（缺了就按「表名 + 行号」补）。
 *
 * 展开写成模块级函数而不是 map 回调里的字面量：`no-map-spread` 会拦 map 回调中的
 * 对象展开（展平逻辑一律抽成函数再 `.map(fn)`，见 docs/design-baseline.md 第 1 节）。
 */
function withRowKey(
  title: string,
  row: Record<string, string | number>,
  index: number,
): Record<string, string | number> {
  return '_key' in row ? row : { _key: `${title}-${index}`, ...row }
}

export function table(
  title: string,
  columns: DataTable['columns'],
  rows: Array<Record<string, string | number>>,
  options: { summary?: Metric[]; emptyText?: string } = {},
): DataTable {
  const summary = options.summary ?? []
  return {
    title,
    columns,
    rows: rows.map((row, index) => withRowKey(title, row, index)),
    ...(summary.length > 0 ? { summary } : {}),
    ...(options.emptyText ? { emptyText: options.emptyText } : {}),
  }
}

/** 告警（④ 附加区）。 */
export function notice(level: Notice['level'], text: string): Notice {
  return { level, text }
}

/** 外链（④ 附加区）。`role` 供卡片操作区 / 标题栏按用途取用。 */
export function link(label: string, url: string, role?: LinkField['role']): LinkField {
  return { label, url, ...(role ? { role } : {}) }
}

/** 按用途取外链 URL（卡片级操作区与「可用模型」外链用）。 */
export function linkOf(
  detail: AccountDetail,
  role: NonNullable<LinkField['role']>,
): string | undefined {
  return detail.links.find((item) => item.role === role)?.url
}

/** 空详情：只给身份区，其余为空数组（`区级有无` 的默认态）。 */
export function emptyDetail(identity: Field[]): AccountDetail {
  return {
    identity,
    metrics: [],
    windows: [],
    balances: [],
    tables: [],
    meta: [],
    links: [],
    notices: [],
  }
}

/** 窗口读数：`resetAt` 只保留「有效时刻」（0 / 负数一律视作不适用）。 */
export function windowQuota(input: {
  key: string
  label: string
  percent: number
  resetAt?: number | null
  used?: number | null
  total?: number | null
  remaining?: number | null
  unit?: string
  countKind?: WindowQuota['countKind']
  status?: string
  cardFace?: boolean
  note?: string
}): WindowQuota {
  const resetAt = input.resetAt ?? null
  return {
    key: input.key,
    label: input.label,
    used: input.used ?? null,
    total: input.total ?? null,
    remaining: input.remaining ?? null,
    percent: input.percent,
    resetAt: resetAt !== null && resetAt > 0 ? resetAt : null,
    ...(input.unit ? { unit: input.unit } : {}),
    ...(input.countKind ? { countKind: input.countKind } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.cardFace === false ? { cardFace: false } : {}),
    ...(input.note ? { note: input.note } : {}),
  }
}

/** 重置行文案（表格列用）：与用量条的倒计时同一份实现，不各自算一遍。 */
export function resetNote(resetAt: number | null): string {
  return resetAt && resetAt > 0 ? formatReset(resetAt) : EMPTY_VALUE
}

/** 重置时刻文案（表格列用）。 */
export function resetAtNote(resetAt: number | null): string {
  return resetAt && resetAt > 0 ? formatDateTime(resetAt) : EMPTY_VALUE
}

/** 卡面可见的窗口（`cardFace !== false`）。 */
export function cardWindows(detail: AccountDetail): WindowQuota[] {
  return detail.windows.filter((window) => window.cardFace !== false)
}

/** 卡面可见的读数（`balances` + `metrics`，各自过滤 `cardFace`）。 */
export function cardMetrics(detail: AccountDetail): Metric[] {
  return [...detail.balances, ...detail.metrics].filter((metric) => metric.cardFace !== false)
}

/**
 * 账号列表 → 卡片视图列表（各 Section 的唯一入口）。
 *
 * 「列表 → 卡片」只有这一处实现：曾经 `types.ts` 里另有一份同名的
 * `buildAccountCards`，两个名字做同一件事，迟早各改一半。
 */
export function cardsOf<T>(
  accounts: readonly AccountEnvelope<T>[] | undefined,
  adapt: AccountDetailAdapter<T>,
): AccountCard[] {
  return (accounts ?? []).map((account) => toAccountCard(account, adapt))
}
