import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import GiteeSection from '../components/GiteeSection.vue'
import type { GiteeBalanceResponse } from '../types'

const fixture: GiteeBalanceResponse = {
  accounts: [
    {
      keyHint: 'UC03****xxxx',
      balance: 45.5,
      usedAmount: 54.5,
      totalAmount: 100,
      details: [{ ident: 'pkg-1', name: '启航包', amount: 100, balance: 45.5 }],
      voucher: {
        data: {
          namespace: 'demo-ns',
          couponCashBalance: 333.13,
          couponComputeBalance: 0,
          coupons: [
            {
              id: 10000003,
              catalog: '黑客松奖品券',
              type: 'cash',
              amount: 200,
              balance: 0,
              expiredAt: 1800028800000,
              status: 1,
              serviceTypes: ['market'],
            },
          ],
        },
      },
    },
    {
      keyHint: 'UC03****failed',
      error: 'Unauthorized',
    },
  ],
}

describe('GiteeSection', () => {
  it('renders balance statistics and package detail table', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('剩余余额')
    expect(text).toContain('45.50')
    expect(text).toContain('54.50')
    expect(text).toContain('100.00')
    expect(text).toContain('启航包')
  })

  it('renders voucher balances and coupon table when voucher data present', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('代金券（demo-ns）')
    expect(text).toContain('现金代金券余额')
    expect(text).toContain('333.13')
    expect(text).toContain('黑客松奖品券')
    expect(text).toContain('200.00 CNY')
    expect(text).toContain('已用尽')
  })

  it('shows warning alert when voucher cookie expired', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: {
        data: {
          accounts: [
            {
              keyHint: 'UC03****xxxx',
              balance: 0,
              usedAmount: 0,
              totalAmount: 0,
              details: [],
              voucher: { error: '模力方舟会话 Cookie 已过期：请重新登录 ai.gitee.com' },
            },
          ],
        },
        loading: false,
        error: null,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('代金券查询失败')
    expect(text).toContain('Cookie 已过期')
    // 资源包余额不受代金券失败影响
    expect(text).toContain('剩余余额')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('UC03****failed')
  })

  it('shows empty packages message when details list is empty', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: {
        data: {
          accounts: [
            {
              keyHint: 'UC03****xxxx',
              balance: 0,
              usedAmount: 0,
              totalAmount: 0,
              details: [],
            },
          ],
        },
        loading: false,
        error: null,
      },
    })
    expect(wrapper.text()).toContain('没有资源包')
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 GITEE_AI_API_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
