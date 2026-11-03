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
        data: {
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
      },
      balance: {
        data: {
          availableBalance: 12.5,
          balance: 20,
          rechargeAmount: 10,
          giveAmount: 10,
          creditStatus: 'ENABLE',
        },
      },
      packages: {
        data: [
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
    expect(detail).toContain('控制台')
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
    expect(detail).toContain('10.00 ¥')
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

  it('Coding Plan 额度查询失败时，余额与资源包照常渲染（不整卡失败）', () => {
    // 上游对「未订阅 GLM Coding Plan」的账号会在额度接口直接返回 500；此时余额与
    // 资源包本来是查得到的，不能跟着一起消失——否则用户会误以为 Key 失效了。
    const partial: ZhipuPackagesResponse = {
      accounts: [
        {
          keyHint: 'id3****partial',
          label: '智谱副号',
          codingPlan: { error: '智谱上游内部错误：Coding Plan 额度查询失败: 内部服务器错误' },
          balance: {
            data: {
              availableBalance: 8,
              balance: 8,
              rechargeAmount: 0,
              giveAmount: 8,
              creditStatus: 'NOT_OPEN',
            },
          },
          packages: { data: [] },
        },
      ],
    }
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: partial, loading: false, error: null, variant: 'balance' },
    })
    expect(wrapper.text()).toContain('可用余额')
    expect(wrapper.text()).toContain('8.00')
    // 是局部降级，不是账号级失败：不该出现「查询失败」红条
    expect(wrapper.text()).not.toContain('查询失败')
  })

  it('Coding Plan 额度查询失败时，卡片上直接说明原因', () => {
    const partial: ZhipuPackagesResponse = {
      accounts: [
        {
          keyHint: 'id3****partial',
          codingPlan: { error: '智谱上游内部错误：Coding Plan 额度查询失败: 内部服务器错误' },
          balance: {
            data: {
              availableBalance: 0,
              balance: 0,
              rechargeAmount: 0,
              giveAmount: 0,
              creditStatus: '',
            },
          },
          packages: { data: [] },
        },
      ],
    }
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: partial, loading: false, error: null, variant: 'plan' },
    })
    expect(wrapper.text()).toContain('内部服务器错误')
    expect(wrapper.text()).not.toContain('未查询到 Coding Plan 额度')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })

  it('excludes pay-as-you-go accounts from the plan variant', () => {
    // 按量付费（noPlan）是服务端确认的分类：它属于余额 Tab，
    // 在套餐订阅里再出现一张「未订阅（按量付费）」的空卡就是自相矛盾。
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: payAsYouGo, loading: false, error: null, variant: 'plan' },
    })
    expect(wrapper.findAll('.account-group')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('未订阅')
  })

  it('keeps pay-as-you-go accounts in the balance variant with one explicit note', () => {
    const wrapper = mountWithTDesign(ZhipuSection, {
      props: { data: payAsYouGo, loading: false, error: null, variant: 'balance' },
    })
    expect(wrapper.findAll('.account-group')).toHaveLength(1)
    expect(wrapper.text()).toContain('可用余额')
    // Coding Plan 已改成一条独立的弱化说明，不再作为一个读数与「生效资源包 0」并排
    expect(wrapper.text()).not.toContain('Coding Plan未订阅')
    const notes = wrapper.findAll('.account-group p.muted').map((node) => node.text())
    expect(notes).toContain('未订阅（按量付费）')
  })
})

/** 纯按量付费账号：codingPlan 返回 noPlan，余额照常。 */
const payAsYouGo: ZhipuPackagesResponse = {
  accounts: [
    {
      keyHint: 'id4****payg',
      label: '按量号',
      codingPlan: { data: { level: '', windows: [], scope: 'personal', noPlan: true } },
      balance: {
        data: {
          availableBalance: 56.7,
          balance: 56.7,
          rechargeAmount: 0,
          giveAmount: 56.7,
          creditStatus: 'NOT_OPEN',
        },
      },
      packages: { data: [] },
    },
  ],
}
