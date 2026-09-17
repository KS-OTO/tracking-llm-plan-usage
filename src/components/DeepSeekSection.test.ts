import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import DeepSeekSection from './DeepSeekSection.vue'
import type { DeepSeekBalanceResponse } from '../types'

const fixture: DeepSeekBalanceResponse = {
  accounts: [
    {
      keyHint: 'sk-0****cdef',
      label: '主力号',
      isAvailable: true,
      balances: [{ currency: 'CNY', total: 110.0, granted: 10.0, toppedUp: 100.0 }],
    },
    {
      keyHint: 'sk-1****dead',
      label: '停用号',
      isAvailable: false,
      balances: [{ currency: 'CNY', total: 0, granted: 0, toppedUp: 0 }],
    },
    {
      keyHint: 'sk-9****aaaa',
      error: 'NetworkError: 请求失败',
    },
  ],
}

describe('DeepSeekSection', () => {
  it('renders the alias as primary name and keeps the key hint as disambiguator', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const account = wrapper.find('.account-group')
    expect(account.find('.account-name').text()).toBe('主力号')
    expect(account.find('.key-hint').text()).toBe('sk-0****cdef')
    expect(account.find('.key-hint').classes()).toContain('key-hint-secondary')
  })

  /**
   * 卡头标签的统一规则：只在**异常态**出现。
   * 曾经的写法是正常态挂「可用」、异常态挂「不可用」——7 张平台卡里只有这一张有标签，
   * 看起来像别的卡漏了状态；而其余平台根本没有账号级可用性字段，补齐只会是伪造信号。
   */
  it('tags only the account that is explicitly unavailable', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const tags = wrapper
      .findAll('.account-head .t-tag')
      .map((tag) => tag.text().trim())
      .filter(Boolean)
    expect(tags).toEqual(['不可用'])
  })

  it('列数由读数个数声明，不由容器宽度偶然决定', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    // 每个账号只有 1 个币种读数 → 走 auto-fit 的 `.grid-metrics`。
    // 曾经这里恒挂 `--pair`（按容器宽度 auto-fit 的旧变体），于是同一对读数在半宽卡里 2 列、
    // 换到整行卡就变 3 列 —— 列数没有语义依据。现在变体名由 utils.metricGridClass 按个数给出。
    expect(wrapper.find('.account-group > .grid-metrics').classes()).toStrictEqual(['grid-metrics'])
  })

  it('keeps only the total balance on the card', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    // 卡面一律符号、标签里不重复币种（#19）：币种代码只留在详情弹窗
    expect(text).toContain('总余额')
    expect(text).toContain('110.00')
    expect(text).toContain('¥')
    expect(text).not.toContain('CNY')
    // 充值/赠金拆分属低优先级信息，已移出卡片（按标签断言：数值 110.00 本身含 "10.00" 子串）
    expect(text).not.toContain('充值')
    expect(text).not.toContain('赠金')
  })

  it('moves the top-up / granted breakdown into the detail dialog', async () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    // 弹窗里的标签带币种代码、数值用符号：同一行不重复币种（#19）
    expect(detail).toContain('CNY 充值')
    expect(detail).toContain('100.00 ¥')
    expect(detail).toContain('CNY 赠金')
    expect(detail).toContain('10.00 ¥')
    expect(detail).toContain('主力号')
  })

  it('shows an alert for a failed account while keeping others rendered', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sk-9****aaaa')])
    expect(wrapper.text()).toContain('NetworkError')
    // 只有成功账号有「详情」入口（2 个成功账号 → 2 个入口）
    expect(wrapper.findAll('.detail-trigger').length).toBe(2)
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 DEEPSEEK_API_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading and no data yet', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })

  it('shows error alert when section-level query failed', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: null, loading: false, error: '后端 API 服务异常' },
    })
    expect(wrapper.text()).toContain('后端 API 服务异常')
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(false)
  })

  it('shows empty state when no account is configured', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: { accounts: [] }, loading: false, error: null },
    })
    expect(wrapper.text()).toContain('未配置 DEEPSEEK_API_KEY')
  })
})
