/**
 * 数值格式化**单一入口**。
 *
 * 全站数值只有三种语义，精度由**语义**决定，不由调用点决定（#19）：
 *
 * | 类别     | 精度         | 舍入       | 适用                             |
 * | -------- | ------------ | ---------- | -------------------------------- |
 * | `money`  | 2 位         | 截断向零   | 一切货币读数（余额/消费/额度）   |
 * | `number` | 1 位         | 四舍五入   | 百分比、比率、折算值             |
 * | `count`  | 0 位+千分位  | 四舍五入   | 请求次数、token 总量、天数、个数 |
 *
 * 渲染层只消费本文件的输出，**禁止再自行 `toFixed` / `Math.round` / `toLocaleString`**。
 * 否则同一个值在不同渲染路径上会出现不同精度 —— 实测过 `34.0%` / `34%` / `34.0101024`
 * 三个版本同时出现在一张卡上（后者来自未传 `decimal-places` 的 `<t-statistic>`，
 * 它会原样输出 0–20 位小数）。
 */

/** 数值语义类别。 */
export type MetricKind = 'money' | 'number' | 'count'

/** 带语义的数值。精度在这里声明一次，渲染层只读 `formatMetric` 的结果。 */
export interface Metric {
  kind: MetricKind
  value: number | null | undefined
  /** 展示用单位（货币符号 / 「次」/ 「tokens」…）；为空则只输出数值。 */
  unit?: string | undefined
}

/** 数值缺位时的中性占位。 */
export const EMPTY_VALUE = '—'

/**
 * 二进制浮点误差补偿量。
 *
 * `1.15 * 100 === 114.99999999999999`，直接 `Math.trunc` 会得到 1.14（系统性少 1 分钱）。
 * 1e-9 足以吸收这个误差，又远小于 0.001，不会把本该截掉的值抬上去
 * （实测 `1.2349999` 仍是 `1.23`、`9.999999` 仍是 `9.99`）。
 */
const FLOAT_EPSILON = 1e-9

/**
 * 金额：保留 2 位并**截断**（向零）。
 *
 * 选 trunc 不选 floor 的理由：契约是「显示的绝对值 ≤ 真实绝对值」，永不夸大。
 * 正余额 `56.789 → 56.78`（不多报可用额度），负余额 `-1.239 → -1.23`（也不多报欠款）；
 * 而 floor 会把负数变成 `-1.24`，反而夸大了欠款。
 */
export function truncateMoney(value: number): number {
  const sign = value >= 0 ? 1 : -1
  // `+ 0` 把 -0 归一成 0：`Math.trunc(-0.1) / 100` 会得到 -0，展示成 "-0.00" 很怪
  return Math.trunc((value + sign * FLOAT_EPSILON) * 100) / 100 + 0
}

/** 金额 → 文本（2 位截断 + 千分位）。`unit` 是展示用符号，不是币种代码。 */
export function formatMoney(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY_VALUE
  }
  const text = truncateMoney(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  })
  return unit ? `${text} ${unit}` : text
}

/**
 * 数值取整到 1 位（四舍五入），**返回 number**。
 *
 * 专供只接受数值的展示组件（`<t-statistic>` 的 `value` 是 `Number`）。必须先收敛再喂进去：
 * 组件只会按自己的 `decimalPlaces` 决定**自己格式化几位**，喂进去的原始浮点该是几位还是几位。
 * 产出文本请用 `formatNumber`。
 */
export function roundNumber(value: number): number {
  return Math.round(value * 10) / 10
}

/** 计数取整到 0 位（四舍五入），**返回 number**。产出文本请用 `formatCount`。 */
export function roundCount(value: number): number {
  return Math.round(value)
}

/** 数值 → 文本（1 位四舍五入）。百分比、比率用这个。 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY_VALUE
  }
  return roundNumber(value).toFixed(1)
}

/** 计数 → 文本（0 位四舍五入 + 千分位）。次数、token 总量、天数用这个。 */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY_VALUE
  }
  return roundCount(value).toLocaleString('zh-CN')
}

/**
 * Token / CREDITS 总量压缩展示：12.5K / 1.20M / 3.40B。
 *
 * 属于计数类的**量级缩写变体**：小数位由量级决定（K 档 1 位、M/B 档 2 位），
 * 不套用 `formatCount` 的「0 位 + 千分位」——缩写本就是压缩展示，再补千分位没有意义。
 * 需要精确整数计数时用 `formatCount`。
 */
export function formatTokens(value: number): string {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`
  }
  return String(value)
}

/** 按语义格式化，`unit` 拼在数值后（渲染层不再碰数字）。 */
export function formatMetric(metric: Metric): string {
  const text =
    metric.kind === 'money'
      ? formatMoney(metric.value)
      : metric.kind === 'count'
        ? formatCount(metric.value)
        : formatNumber(metric.value)
  if (text === EMPTY_VALUE) {
    return EMPTY_VALUE
  }
  return metric.unit ? `${text} ${metric.unit}` : text
}

/**
 * 币种代码 → 展示符号（#19：卡面一律符号，代码只留在详情弹窗）。
 *
 * 未知代码原样返回，不猜 —— 币种搞错比显示代码严重得多。
 */
export function currencySymbol(code: string | null | undefined): string | undefined {
  if (!code) {
    return undefined
  }
  const upper = code.toUpperCase()
  if (upper === 'CNY' || upper === 'RMB') {
    return '¥'
  }
  if (upper === 'USD') {
    return '$'
  }
  if (upper === 'EUR') {
    return '€'
  }
  if (upper === 'GBP') {
    return '£'
  }
  if (upper === 'JPY') {
    return '¥'
  }
  return code
}

/** 金额 + 币种代码一步到位：`formatCurrency(12.345, 'CNY')` → `12.34 ¥`。 */
export function formatCurrency(value: number | null | undefined, code?: string | null): string {
  return formatMoney(value, currencySymbol(code))
}

/**
 * 进度条的 `percentage`：取整并封顶到 [0, 100]。
 *
 * 必须收敛，不能把原始百分比直接喂给 `<t-progress>`：TDesign 会把 `percentage`
 * **原样**渲染成进度条上的百分比文案，于是上游的 `34.0101024` 会显示成 `34.0101024%`
 * （实测 New API 卡的订阅窗口就是这个症状）。
 *
 * 取整与卡面文本的 1 位并不矛盾：**进度条本身不打印数字**，卡面上的百分比一律由
 * `formatNumber` 产出；进度条只负责长度（各窗口块都写了 `:label="false"`）。
 */
export function progressPercentage(percent: number): number {
  return Math.round(Math.min(100, Math.max(0, percent)))
}

/** 金额是否为「有值」——用于决定要不要渲染单位（缺值时单位也要跟着消失）。 */
export function hasValue(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value)
}
