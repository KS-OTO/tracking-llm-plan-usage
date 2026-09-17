import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import GiteeSection from './GiteeSection.vue'
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
  it('renders the three balance statistics on the card', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('剩余余额')
    expect(text).toContain('45.50')
    expect(text).toContain('54.50')
    expect(text).toContain('100.00')
    // 资源包明细与代金券已移出卡片
    expect(text).not.toContain('启航包')
    expect(text).not.toContain('代金券')
  })

  it('moves the package detail table into the detail dialog', async () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('资源包明细（1）')
    expect(detail).toContain('启航包')
  })

  it('moves voucher balances and coupon table into the detail dialog', async () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('代金券（demo-ns）')
    expect(detail).toContain('现金代金券余额')
    expect(detail).toContain('333.13')
    expect(detail).toContain('黑客松奖品券')
    expect(detail).toContain('200.00 ¥')
    expect(detail).toContain('已用尽')
  })

  it('shows warning alert when voucher cookie expired', async () => {
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
    // 资源包余额不受代金券失败影响，仍是卡片上的读数
    expect(wrapper.text()).toContain('剩余余额')
    const detail = await openDetail(wrapper)
    expect(detail).toContain('代金券查询失败')
    expect(detail).toContain('Cookie 已过期')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(GiteeSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('UC03****failed')])
  })

  it('shows empty packages message in the dialog when details list is empty', async () => {
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
    expect(wrapper.text()).not.toContain('没有资源包')
    const detail = await openDetail(wrapper)
    expect(detail).toContain('没有资源包')
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
