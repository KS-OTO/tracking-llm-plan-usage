import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { SRC_DIR, vueFiles } from './test-utils/src-files'
import {
  currencySymbol,
  EMPTY_VALUE,
  formatCount,
  formatCurrency,
  formatMetric,
  formatMoney,
  formatNumber,
  formatTokens,
  hasValue,
  metricValueText,
  progressPercentage,
  roundCount,
  roundNumber,
  truncateMoney,
} from './format'

describe('truncateMoney', () => {
  it('真截断：不四舍五入', () => {
    expect(truncateMoney(12.345)).toBe(12.34)
    expect(truncateMoney(56.789)).toBe(56.78)
    expect(truncateMoney(100.999)).toBe(100.99)
    expect(truncateMoney(9.999999)).toBe(9.99)
    expect(truncateMoney(0.009)).toBe(0)
  })

  it('补偿二进制浮点误差，不系统性少 1 分钱', () => {
    // 这些值直接 Math.trunc(v * 100) / 100 会各少 1 分（实测 13 样本 7 个踩坑）
    expect(truncateMoney(1.15)).toBe(1.15)
    expect(truncateMoney(2.55)).toBe(2.55)
    expect(truncateMoney(4.35)).toBe(4.35)
    expect(truncateMoney(8.95)).toBe(8.95)
    expect(truncateMoney(0.29)).toBe(0.29)
    expect(truncateMoney(2.03)).toBe(2.03)
    expect(truncateMoney(5.02)).toBe(5.02)
  })

  it('补偿量不会把本该截掉的值抬上去', () => {
    expect(truncateMoney(1.2349999)).toBe(1.23)
    expect(truncateMoney(1.2300001)).toBe(1.23)
  })

  it('负数向零截断（不夸大欠款）', () => {
    expect(truncateMoney(-1.239)).toBe(-1.23)
    expect(truncateMoney(-1.231)).toBe(-1.23)
  })

  it('负零归一为零，不显示 -0.00', () => {
    expect(Object.is(truncateMoney(-0.001), 0)).toBe(true)
  })
})

describe('formatMoney', () => {
  it('2 位截断 + 千分位', () => {
    expect(formatMoney(12.345)).toBe('12.34')
    expect(formatMoney(1234.567)).toBe('1,234.56')
    expect(formatMoney(0)).toBe('0.00')
  })

  it('单位拼在数值后', () => {
    expect(formatMoney(12.345, '¥')).toBe('12.34 ¥')
  })

  it('缺值返回中性占位', () => {
    expect(formatMoney(null)).toBe(EMPTY_VALUE)
    expect(formatMoney(undefined)).toBe(EMPTY_VALUE)
    expect(formatMoney(Number.NaN)).toBe(EMPTY_VALUE)
  })
})

describe('formatNumber', () => {
  it('1 位四舍五入', () => {
    expect(formatNumber(34.0101024)).toBe('34.0')
    expect(formatNumber(66.666)).toBe('66.7')
    expect(formatNumber(33.95)).toBe('34.0')
    expect(formatNumber(99.99)).toBe('100.0')
  })

  it('整数也保留 1 位（保证同字段永远同精度）', () => {
    expect(formatNumber(100)).toBe('100.0')
    expect(formatNumber(0)).toBe('0.0')
  })
})

describe('formatCount', () => {
  it('0 位 + 千分位', () => {
    expect(formatCount(1234)).toBe('1,234')
    expect(formatCount(1234.5)).toBe('1,235')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1_234_567)).toBe('1,234,567')
  })
})

describe('roundNumber / roundCount（喂给只吃数值的展示组件）', () => {
  it('roundNumber 收敛到 1 位，仍是 number', () => {
    // 关键：必须先把值收敛好再交给 <t-statistic>，它的 decimalPlaces 只管自己格式化几位，
    // 不传就是原样输出 0-20 位（实测 34.0101024 会原样漏到卡面）
    expect(roundNumber(34.0101024)).toBe(34)
    expect(roundNumber(66.66)).toBe(66.7)
    expect(typeof roundNumber(34.0101024)).toBe('number')
  })

  it('roundCount 收敛到 0 位，仍是 number', () => {
    expect(roundCount(1234.5)).toBe(1235)
    expect(roundCount(3473)).toBe(3473)
    expect(typeof roundCount(1234.5)).toBe('number')
  })

  it('与文本版保持同一精度口径（同一个值不会两个写法）', () => {
    const raw = 34.0101024
    expect(roundNumber(raw).toFixed(1)).toBe(formatNumber(raw))
    expect(roundCount(1234.5).toLocaleString('zh-CN')).toBe(formatCount(1234.5))
  })

  it('负零归一为零（-0 会渲染成 "-0" / "-0.0"）', () => {
    // 与 truncateMoney 同一条理由：真实上游会给 -0.04 这种净值，
    // Math.round 之后是 -0，直接格式化就是 "-0" 这种看着像 bug 的文本。
    expect(Object.is(roundNumber(-0.04), 0)).toBe(true)
    expect(Object.is(roundCount(-0.2), 0)).toBe(true)
    expect(formatNumber(-0.04)).toBe('0.0')
    expect(formatCount(-0.2)).toBe('0')
  })
})

describe('formatMetric', () => {
  it('按 kind 选精度', () => {
    expect(formatMetric({ kind: 'money', value: 12.345, unit: '¥' })).toBe('12.34 ¥')
    expect(formatMetric({ kind: 'percent', value: 34.0101024, unit: '%' })).toBe('34.0 %')
    expect(formatMetric({ kind: 'count', value: 1234.5, unit: '次' })).toBe('1,235 次')
    expect(formatMetric({ kind: 'tokens', value: 1_250_000, unit: 'token' })).toBe('1.25M token')
  })

  it('文本类原样透传，不做数值解析', () => {
    expect(formatMetric({ kind: 'text', value: 'active' })).toBe('active')
    expect(formatMetric({ kind: 'duration', value: '30 天' })).toBe('30 天')
    expect(formatMetric({ kind: 'text', value: '' })).toBe(EMPTY_VALUE)
  })

  it('缺值时单位也一起消失', () => {
    expect(formatMetric({ kind: 'money', value: null, unit: '¥' })).toBe(EMPTY_VALUE)
  })
})

/**
 * 单位是**独立元素**（#19）：卡面上数值与单位是两个节点，
 * 所以取值文本的入口必须能单独拿到「不含单位」的那一段。
 */
describe('metricValueText', () => {
  it('只给数值，不带单位', () => {
    expect(metricValueText({ kind: 'money', value: 12.345 })).toBe('12.34')
    expect(metricValueText({ kind: 'count', value: 1234.5 })).toBe('1,235')
    expect(metricValueText({ kind: 'percent', value: 34.0101024 })).toBe('34.0')
  })

  it('数值缺位时给中性占位（此时单位也不该渲染）', () => {
    expect(metricValueText({ kind: 'money', value: null })).toBe(EMPTY_VALUE)
    expect(metricValueText({ kind: 'percent', value: Number.NaN })).toBe(EMPTY_VALUE)
  })
})

describe('currencySymbol', () => {
  it('代码转符号', () => {
    expect(currencySymbol('CNY')).toBe('¥')
    expect(currencySymbol('cny')).toBe('¥')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('€')
  })

  it('未知代码原样返回，不猜', () => {
    expect(currencySymbol('POINTS')).toBe('POINTS')
    expect(currencySymbol(null)).toBeUndefined()
    expect(currencySymbol('')).toBeUndefined()
  })
})

describe('formatCurrency', () => {
  it('金额 + 币种代码一步到位', () => {
    expect(formatCurrency(12.345, 'CNY')).toBe('12.34 ¥')
    expect(formatCurrency(110, 'USD')).toBe('110.00 $')
    // 币种未知就不带单位，而不是编一个
    expect(formatCurrency(110, null)).toBe('110.00')
  })
})

describe('formatTokens（计数类的量级缩写变体）', () => {
  it('不足 1K 时没有量级可缩写，退回计数精度', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(347)).toBe('347')
    // 唯一会「给精确值加误差」的一档，但浮点尾巴本来就不是信息：
    // 实测火山 Agent Plan 每周窗口 35000 - 34793.6528 === 206.34719999999652
    expect(formatTokens(206.34719999999652)).toBe('206')
    expect(formatTokens(206.5)).toBe('207')
    expect(formatTokens(0.4)).toBe('0')
  })

  it('按量级压缩：K 档 1 位、M/B 档 2 位', () => {
    expect(formatTokens(12_500)).toBe('12.5K')
    expect(formatTokens(1_200_000)).toBe('1.20M')
    expect(formatTokens(3_400_000_000)).toBe('3.40B')
  })

  it('缺值 / 非有限数给中性占位，不漏 NaN 或 InfinityB', () => {
    expect(formatTokens(Number.NaN)).toBe(EMPTY_VALUE)
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE)
  })
})

describe('progressPercentage', () => {
  it('取整，不把上游原始精度漏到进度条文案上', () => {
    // New API 的订阅窗口算出来是 34.0101024 / 3.2147572，直接喂给 <t-progress>
    // 会渲染成 "34.0101024%"（实测报上来的症状）
    expect(progressPercentage(34.0101024)).toBe(34)
    expect(progressPercentage(3.2147572)).toBe(3)
    expect(progressPercentage(0.4)).toBe(0)
    expect(progressPercentage(99.5)).toBe(100)
  })

  it('封顶到 [0, 100] 两端', () => {
    expect(progressPercentage(140)).toBe(100)
    expect(progressPercentage(-3)).toBe(0)
  })
})

describe('hasValue', () => {
  it('只认有限数', () => {
    expect(hasValue(0)).toBe(true)
    expect(hasValue(null)).toBe(false)
    expect(hasValue(undefined)).toBe(false)
    expect(hasValue(Number.NaN)).toBe(false)
  })
})

/**
 * 为什么用测试来管数值精度：这两类问题**不会让任何测试失败**，只会在肉眼看卡时才暴露 ——
 *
 * 1. `<t-statistic>` 不传 `decimal-places` 时，TDesign 用的是
 *    `minimumFractionDigits: 0 / maximumFractionDigits: 20`，**不是取整，是原样输出
 *    0-20 位小数**；上游的 `34.0101024` 就这么印到了卡面上（实测报上来的症状）。
 * 2. `toFixed` / `Math.round` 散落在渲染层，同一个值在不同渲染路径上会有不同精度
 *    （实测同一张卡同时出现 `34.0%` / `34%` / `34.0101024`）。
 *
 * 两条都变成断言，漂移当场被挡住 —— 与 `server/env-vars.test.ts` 管文档漂移是同一手法。
 */
describe('数值格式化的单一入口（守卫）', () => {
  const files = vueFiles(SRC_DIR)

  /**
   * 唯一允许用 `v-bind` 传 `<t-statistic>` 的组件。
   *
   * 它的属性集是 `computed` 出来的（按 `Metric.kind` 选精度），因此文件里看不到
   * 字面的 `decimal-places`。豁免的前提由下面第二条断言守着：它必须真的在用
   * `decimalPlaces` / `format`，且全站只有这一处读数瓦片实现。
   */
  const METRIC_TILE = 'components/ui/MetricTile.vue'

  it('扫到了组件文件（守卫本身不能是空转的）', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('组件层不得自行做数值格式化', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/toFixed\(|toLocaleString\(|Intl\.NumberFormat|Math\.round\(/.test(line)) {
            offenders.push(`${relative(SRC_DIR, file)}:${index + 1} ${line.trim()}`)
          }
        })
    }
    expect(offenders).toStrictEqual([])
  })

  it('每个 <t-statistic> 都显式声明 decimal-places 或 format', () => {
    const offenders: string[] = []
    for (const file of files) {
      // 路径统一成 `/`：Windows 上 `relative` 给的是反斜杠，豁免名单因此对不上
      const name = relative(SRC_DIR, file).replaceAll('\\', '/')
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/<t-statistic\b[\s\S]*?\/>/g)) {
        const block = match[0]
        if (
          name !== METRIC_TILE &&
          !block.includes('decimal-places') &&
          !block.includes(':format')
        ) {
          const line = text.slice(0, match.index).split('\n').length
          offenders.push(`${name}:${line}`)
        }
      }
    }
    expect(offenders).toStrictEqual([])
  })

  it('读数瓦片只有一处实现，且它自己确实在决定精度', () => {
    const text = readFileSync(resolve(SRC_DIR, METRIC_TILE), 'utf8')
    // 两条豁免前提：真的在用这两种属性，且模板里只渲染一个 <t-statistic>。
    // 只数 <template> 那一半 —— 文档注释里可以随便提这个组件名，
    // 数全文会把注释也当成一处实现（实测数出 3 处）。
    expect(text).toContain('<template>')
    const template = text.slice(text.indexOf('<template>'))
    expect(text).toContain('decimalPlaces')
    expect(text).toContain('format:')
    expect(template.match(/<t-statistic\b/g)).toHaveLength(1)
  })
})
