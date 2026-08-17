import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import ZhipuSection from '../components/ZhipuSection.vue'
import type { ZhipuPackagesResponse } from '../types'

const fixture: ZhipuPackagesResponse = {
  accounts: [
    {
      keyHint: 'id1****abcd',
      codingPlan: {
        level: 'Max',
        windows: [
          {
            window: 'fiveHour',
            used: 40_000,
            total: 100_000,
            remaining: 60_000,
            percentage: 40,
            nextResetTime: Date.now() + 3_600_000,
          },
        ],
      },
      balance: {
        availableBalance: 12.5,
        balance: 20,
        rechargeAmount: 10,
        giveAmount: 10,
        creditStatus: 'ENABLE',
      },
      packages: [
        {
          id: 1,
          resourcePackageName: 'GLM 资源包 A',
          suitableScene: 'coding',
          type: 'pay',
          tokensMagnitude: 5_000_000,
          tokenBalance: 5_000_000,
          consumeType: 'coding',
          effectiveTime: '2026-01-01T00:00:00',
          availableBalance: 1_200_000,
          packageExpirationTime: '2026-12-31T23:59:59',
          status: 'EFFECTIVE',
        },
      ],
    },
    {
      keyHint: 'id2****failed',
      error: 'InvalidApiKey',
    },
  ],
}

describe('ZhipuSection', () => {
  it('renders coding plan level, window usage and balance', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('GLM Coding Plan：Max')
    expect(text).toContain('40.0K / 100.0K')
    expect(text).toContain('40.0%')
    expect(text).toContain('可用余额')
    expect(text).toContain('12.50')
    expect(text).toContain('已开通')
  })

  it('renders effective token packages with formatted totals', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('GLM 资源包 A')
    expect(text).toContain('付费')
    expect(text).toContain('5.00M')
    expect(text).toContain('1.20M')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('id2****failed')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
