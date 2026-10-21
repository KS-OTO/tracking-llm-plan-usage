import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import BalanceSection from './BalanceSection.vue'
import type { SimpleBalanceResponse } from '../types'

const fixture: SimpleBalanceResponse = {
  accounts: [
    {
      keyHint: 'sk-s****flow',
      label: '主力',
      provider: 'SiliconFlow',
      balance: 12.34,
      unit: 'CNY',
      details: [
        { key: 'recharge', label: '充值余额', value: 10, unit: 'CNY' },
        { key: 'granted', label: '赠费余额', value: 2.34, unit: 'CNY' },
      ],
      meta: [{ label: '账户状态', value: 'normal' }],
    },
    { keyHint: 'sk-s****fail', error: 'SiliconFlow API Key 无效或已失效（HTTP 401）' },
  ],
}

describe('BalanceSection', () => {
  it('keeps the remaining balance on the card and extra dimensions in the dialog', async () => {
    const wrapper = mountWithTDesign(BalanceSection, {
      props: {
        title: 'SiliconFlow',
        envHint: 'SILICONFLOW_API_KEY',
        data: fixture,
        loading: false,
        error: null,
      },
    })

    expect(wrapper.find('.section-title > span').text()).toBe('SiliconFlow')
    const text = wrapper.text()
    expect(text).toContain('主力')
    expect(text).toContain('12.34')
    expect(text).not.toContain('充值余额')

    const detail = await openDetail(wrapper)
    expect(detail).toContain('充值余额')
    expect(detail).toContain('赠费余额')
    expect(detail).toContain('账户状态')
    expect(detail).toContain('normal')
  })

  it('shows a failed account alert with the key hint', () => {
    const wrapper = mountWithTDesign(BalanceSection, {
      props: {
        title: 'SiliconFlow',
        envHint: 'SILICONFLOW_API_KEY',
        data: fixture,
        loading: false,
        error: null,
      },
    })

    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sk-s****fail')])
  })

  it('shows the plan name instead of a fake zero for unlimited groups', () => {
    const wrapper = mountWithTDesign(BalanceSection, {
      props: {
        title: 'Sub2API',
        envHint: 'SUB2API_BASE_URL / SUB2API_API_KEY',
        data: {
          accounts: [
            {
              keyHint: 'sub****key',
              provider: 'Sub2API',
              balance: null,
              unit: 'USD',
              plan: 'Ultra',
            },
          ],
        },
        loading: false,
        error: null,
      },
    })

    expect(wrapper.text()).toContain('Ultra（不限量）')
    expect(wrapper.text()).not.toContain('0.00')
  })

  it('shows a neutral empty state when the provider is not configured', () => {
    const wrapper = mountWithTDesign(BalanceSection, {
      props: {
        title: 'StepFun',
        envHint: 'STEPFUN_API_KEY',
        data: null,
        loading: false,
        error: null,
        notConfigured: true,
      },
    })

    expect(wrapper.text()).toContain('未配置 STEPFUN_API_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })
})
