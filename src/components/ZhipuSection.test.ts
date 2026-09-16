import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import ZhipuSection from './ZhipuSection.vue'
import type { ZhipuPackagesResponse } from '../types'

const fixture: ZhipuPackagesResponse = {
  accounts: [
    {
      keyHint: 'id1****abcd',
      label: '智谱主号',
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
  it('plan variant keeps only the coding plan windows on the card', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null, variant: 'plan' },
    })
    const text = wrapper.text()
    expect(text).toContain('40.0K / 100.0K')
    expect(text).toContain('40.0%')
    // 余额与资源包在套餐订阅 Tab 属低优先级信息，已移出卡片
    expect(text).not.toContain('可用余额')
    expect(text).not.toContain('GLM 资源包 A')
  })

  it('plan variant moves level, console link and packages into the detail dialog', async () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null, variant: 'plan' },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('Coding Plan 等级')
    expect(detail).toContain('Max')
    expect(detail).toContain('控制台用量页')
    expect(detail).toContain('GLM 资源包 A')
    expect(detail).toContain('付费')
    expect(detail).toContain('5.00M')
    expect(detail).toContain('1.20M')
    expect(detail).toContain('2026-12-31 23:59:59')
  })

  it('balance variant keeps only the two balance readings on the card', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null, variant: 'balance' },
    })
    const text = wrapper.text()
    expect(text).toContain('可用余额')
    expect(text).toContain('12.50')
    expect(text).toContain('账户余额')
    expect(text).toContain('20.00')
    expect(text).not.toContain('GLM 资源包 A')
    expect(text).not.toContain('已开通')
  })

  it('balance variant moves secondary amounts and packages into the detail dialog', async () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null, variant: 'balance' },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('信用支付')
    expect(detail).toContain('已开通')
    expect(detail).toContain('累计充值')
    expect(detail).toContain('10.00 CNY')
    expect(detail).toContain('GLM 资源包 A')
  })

  it('prefers the alias over the key hint', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null, variant: 'plan' },
    })
    const account = wrapper.find('.account-group')
    expect(account.find('.account-name').text()).toBe('智谱主号')
    expect(account.find('.key-hint').text()).toBe('id1****abcd')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: fixture, loading: false, error: null, variant: 'plan' },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('id2****failed')])
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
