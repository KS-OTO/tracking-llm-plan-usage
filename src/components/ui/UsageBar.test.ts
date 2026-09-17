import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from '../../test-utils/mount'

import UsageBar from './UsageBar.vue'
import type { WindowQuota } from '../../types'

/** 四段齐全的窗口：标题 / 进度 / 数值 / 脚注都能渲染。 */
const quota: WindowQuota = {
  key: 'fiveHour',
  label: '5 小时窗口',
  used: 40_000,
  total: 64_000,
  remaining: 24_000,
  percent: 62.4,
  resetAt: Date.now() + 3 * 3_600_000,
  unit: '次',
}

function mountBar(overrides: Partial<WindowQuota> = {}) {
  return mountWithTDesign(UsageBar, { props: { quota: { ...quota, ...overrides } } })
}

/**
 * `#18` 的回归护栏：这四条是「同一语义四种长相」的根因，
 * 少一条就会退回「某个组件自己拼 DOM」的状态。
 */
describe('UsageBar', () => {
  it('百分比先收敛再喂给进度条（TDesign 会原样打印 percentage）', () => {
    const bar = mountBar({ percent: 34.0101024 }).findComponent({ name: 'TProgress' })
    // 取整并封顶：不收敛的话进度条上会出现 34.0101024%
    expect(bar.props('percentage')).toBe(34)
    expect(bar.props('label')).toBe(false)
  })

  it('进度条状态随阈值变化（以前 NewApi 缺 :status，永远不变色）', () => {
    expect(mountBar({ percent: 10 }).findComponent({ name: 'TProgress' }).props('status')).toBe(
      'success',
    )
    expect(mountBar({ percent: 75 }).findComponent({ name: 'TProgress' }).props('status')).toBe(
      'warning',
    )
    expect(mountBar({ percent: 95 }).findComponent({ name: 'TProgress' }).props('status')).toBe(
      'error',
    )
  })

  it('有 used/total 时数值行给计数，右侧才有百分比（同一数字绝不出现两次）', () => {
    const text = mountBar().find('.window-meta').text()
    expect(text).toContain('已用 40.0K / 64.0K 次')
    // 左侧给的是计数，右侧才补百分比
    expect(text).toContain('62.4%')
    expect(text.match(/62\.4%/g)).toHaveLength(1)
  })

  it('没有 used/total 时退化成「已用 N%」，且不再重复百分比', () => {
    const text = mountBar({ used: null, total: null, remaining: null }).find('.window-meta').text()
    expect(text).toContain('已用 62.4%')
    expect(text.match(/62\.4%/g)).toHaveLength(1)
  })

  it('缺 remaining / resetAt 时对应段落不渲染', () => {
    const bar = mountBar({ remaining: null, resetAt: null })
    // 只有「剩余」与「重置于」都不成立时脚注才整段消失
    expect(bar.find('.window-foot').exists()).toBe(false)
    // 「剩余」缺失但重置时刻还在时，脚注仍在、只是不写剩余
    const partial = mountBar({ remaining: null })
    expect(partial.find('.window-foot').text()).toContain('重置于')
    expect(partial.find('.window-foot').text()).not.toContain('剩余')
  })

  it('countKind 决定计数精度：按金额计的窗口不能用量级缩写', () => {
    // 默认（tokens）：六位数缩写成 64.0K
    expect(mountBar().find('.window-meta').text()).toContain('40.0K / 64.0K')
    // money：12.00 必须是 12.00，缩写成 12 会丢掉两位小数
    const money = mountBar({
      used: 12,
      total: 100,
      remaining: 88,
      unit: '¥',
      countKind: 'money',
    })
    expect(money.find('.window-meta').text()).toContain('¥12.00 / ¥100.00')
    // 货币是**符号前置**：两个数字各自带符号，读者不必猜单位管到哪一段
    expect(money.find('.window-foot').text()).toContain('剩余 ¥88.00')
    // count：整数 + 千分位，不缩写
    const count = mountBar({ used: 12_345, total: 999_999, countKind: 'count' })
    expect(count.find('.window-meta').text()).toContain('12,345 / 999,999')
  })

  it('非货币单位后置，货币符号只在每个数值前出现一次', () => {
    // 非货币：量纲跟在数值后（「24.0K 次」），与旧写法一致
    expect(mountBar().find('.window-foot').text()).toContain('剩余 24.0K 次')
    // 货币：两个数字各带一次符号，行尾不再重复
    const money = mountBar({ used: 12, total: 100, remaining: 88, unit: '¥', countKind: 'money' })
    expect(money.find('.window-meta').text()).toContain('已用 ¥12.00 / ¥100.00')
    expect(money.find('.window-meta').text().match(/¥/g)).toHaveLength(2)
  })

  it('平台专属说明追加到脚注行末尾', () => {
    const bar = mountWithTDesign(UsageBar, { props: { quota, note: '周期 30 天' } })
    expect(bar.find('.window-foot').text()).toContain('周期 30 天')
  })

  it('上游限流状态同时给标题标签与脚注说明', () => {
    const bar = mountBar({ status: 'rate-limited' })
    expect(bar.find('.window-head .t-tag').text()).toBe('上游限流中')
    expect(bar.find('.window-foot').text()).toContain('已被上游限流')
  })

  it('四段齐全时 DOM 顺序固定：标题 → 进度 → 数值 → 脚注', () => {
    const bar = mountBar()
    const html = bar.html()
    // 找的是 class 名（不带前导点）：DOM 里不会有 ".window-head" 这种字面串
    const order = ['window-head', 't-progress', 'window-meta', 'window-foot'].map((name) =>
      html.indexOf(name),
    )
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toStrictEqual(order.toSorted((a, b) => a - b))
  })
})
