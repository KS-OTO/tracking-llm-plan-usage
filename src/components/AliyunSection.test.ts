import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import AliyunSection from './AliyunSection.vue'
import type { AliyunPackagesResponse } from '../types'

const fixture: AliyunPackagesResponse = {
  accounts: [
    {
      keyHint: 'LTAI****wxyz',
      packages: [
        {
          commodityCode: 'bailian-token',
          packageType: '一年期',
          region: 'cn-beijing',
          remark: '',
          applicableProducts: ['bailian'],
          instanceId: 'pkg-inst-1',
          totalAmount: '1000000',
          totalAmountUnit: 'Tokens',
          remainingAmount: '250000',
          remainingAmountUnit: 'Tokens',
          effectiveTime: '2026-01-01',
          expiryTime: '2026-12-31',
          status: 'Available',
        },
      ],
      totalCount: 1,
    },
    {
      keyHint: 'LTAI****failed',
      error: 'SignatureDoesNotMatch',
    },
  ],
}

describe('AliyunSection', () => {
  it('keeps only the package counts on the card', () => {
    const wrapper = mountWithTDesign(AliyunSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('资源包实例')
    expect(text).toContain('可用实例')
    // 明细字段已移出卡片
    expect(text).not.toContain('bailian-token')
    expect(text).not.toContain('250000 Tokens')
  })

  it('moves resource package instance rows into the detail dialog', async () => {
    const wrapper = mountWithTDesign(AliyunSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('bailian-token')
    expect(detail).toContain('1000000 Tokens')
    expect(detail).toContain('250000 Tokens')
    expect(detail).toContain('2026-01-01 ~ 2026-12-31')
    expect(detail).toContain('Available')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(AliyunSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('LTAI****failed')])
  })

  it('shows empty instance message when totalCount is zero', async () => {
    const wrapper = mountWithTDesign(AliyunSection, {
      props: {
        data: {
          accounts: [{ keyHint: 'LTAI****wxyz', packages: [], totalCount: 0 }],
        },
        loading: false,
        error: null,
      },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('该账号下没有资源包实例')
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(AliyunSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(AliyunSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
