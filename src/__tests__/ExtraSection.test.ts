import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import ExtraSection from '../components/ExtraSection.vue'
import type { ExtrasResponse } from '../types'

const fixture: ExtrasResponse = {
  balances: [
    {
      provider: 'StepFun 阶跃星辰',
      accounts: [
        {
          keyHint: 'sf-0****cdef',
          provider: 'StepFun 阶跃星辰',
          balance: 88.8,
          total: 100,
          used: 11.2,
          unit: 'CNY',
        },
        {
          keyHint: 'sf-9****failed',
          error: 'InvalidApiKey',
        },
      ],
    },
  ],
  plans: [
    {
      provider: 'Kimi For Coding',
      accounts: [
        {
          keyHint: 'sk-0****mn',
          provider: 'Kimi For Coding',
          windows: [{ window: 'fiveHour', percent: 55.5, resetTime: Date.now() + 3_600_000 }],
        },
      ],
    },
  ],
  configured: 3,
}

describe('ExtraSection', () => {
  it('renders balance groups with formatted amounts', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('StepFun 阶跃星辰')
    expect(text).toContain('88.80')
    expect(text).toContain('100.00 CNY')
  })

  it('renders plan groups with window progress', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('Kimi For Coding')
    expect(text).toContain('55.5%')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('sf-9****failed')
  })

  it('shows the not-configured empty state when configured is zero', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: {
        data: { balances: [], plans: [], configured: 0 },
        loading: false,
        error: null,
      },
    })
    expect(wrapper.text()).toContain('未配置扩展平台密钥')
  })

  it('shows an alert for a failed plan-group account', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: {
        data: {
          balances: [],
          plans: [
            {
              provider: 'Kimi For Coding',
              accounts: [{ keyHint: 'sk-9****failed', error: 'InvalidApiKey' }],
            },
          ],
          configured: 1,
        },
        loading: false,
        error: null,
      },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('sk-9****failed')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
