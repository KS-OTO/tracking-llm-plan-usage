import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import DeepSeekSection from '../components/DeepSeekSection.vue'
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
      keyHint: 'sk-9****aaaa',
      error: 'NetworkError: 请求失败',
    },
  ],
}

describe('DeepSeekSection', () => {
  it('renders masked account hint and balance values from fixture data', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('sk-0****cdef')
    expect(text).toContain('CNY 总余额')
    expect(text).toContain('110.00')
    expect(text).toContain('100.00 CNY')
    expect(text).toContain('10.00 CNY')
    expect(text).toContain('可用')
  })

  it('shows an alert for a failed account while keeping others rendered', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('sk-9****aaaa')
    expect(alerts[0]!.text()).toContain('NetworkError')
  })

  it('shows the configured alias as primary account name', () => {
    const wrapper = mountWithTDesign(DeepSeekSection, {
      props: { data: fixture, loading: false, error: null },
    })
    expect(wrapper.text()).toContain('主力号')
    expect(wrapper.text()).toContain('sk-0****cdef')
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
