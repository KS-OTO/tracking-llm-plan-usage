import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from './mount'

import ExtraSection from '../components/ExtraSection.vue'
import type { ExtrasResponse } from '../types'

/** 余额类扩展平台：卡片只显示余额，总额/已用/备注在「详情」弹窗里。 */
const fixture: ExtrasResponse = {
  balances: [
    {
      provider: 'StepFun 阶跃星辰',
      accounts: [
        {
          keyHint: 'sf-0****cdef',
          label: '前端团队',
          provider: 'StepFun 阶跃星辰',
          balance: 88.8,
          total: 100,
          used: 11.2,
          unit: 'CNY',
          note: '企业认证账户',
        },
        {
          keyHint: 'sf-9****failed',
          error: 'InvalidApiKey',
        },
      ],
    },
  ],
  configured: 2,
}

describe('ExtraSection', () => {
  it('renders balance groups with the balance reading only', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('StepFun 阶跃星辰')
    expect(text).toContain('88.80')
    // 总额/已用/备注属低优先级信息，默认不在卡片上
    expect(text).not.toContain('100.00 CNY')
    expect(text).not.toContain('企业认证账户')
  })

  it('prefers the alias over the key hint', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const account = wrapper.find('.account-group')
    // 别名是主标题，Key 掩码退居次要位置但仍在（消歧用）
    expect(account.find('.account-name').text()).toBe('前端团队')
    expect(account.find('.key-hint').text()).toBe('sf-0****cdef')
    expect(account.find('.key-hint').classes()).toContain('key-hint-secondary')
  })

  it('falls back to the key hint as the primary name without an alias', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: {
        data: {
          balances: [
            {
              provider: 'Novita AI',
              accounts: [
                { keyHint: 'nv-0****abcd', provider: 'Novita AI', balance: 3, unit: 'USD' },
              ],
            },
          ],
          configured: 1,
        },
        loading: false,
        error: null,
      },
    })
    const account = wrapper.find('.account-group')
    expect(account.find('.account-name').exists()).toBe(false)
    expect(account.find('.key-hint').text()).toBe('nv-0****abcd')
    expect(account.find('.key-hint').classes()).not.toContain('key-hint-secondary')
  })

  it('moves total / used / note into the detail dialog', async () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    expect(wrapper.find('.detail-trigger').exists()).toBe(true)

    const detail = await openDetail(wrapper)
    expect(detail).toContain('前端团队')
    expect(detail).toContain('总额')
    expect(detail).toContain('100.00 CNY')
    expect(detail).toContain('11.20 CNY')
    expect(detail).toContain('企业认证账户')
  })

  it('shows an alert for the failed account without a detail trigger', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sf-9****failed')])
    // 仅成功账号有「详情」入口
    expect(wrapper.findAll('.detail-trigger').length).toBe(1)
  })

  it('shows the not-configured empty state when configured is zero', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: {
        data: { balances: [], configured: 0 },
        loading: false,
        error: null,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('未配置扩展平台密钥')
    // 套餐类密钥不再属于本区块
    expect(text).not.toContain('OPENCODE_GO')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(ExtraSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
