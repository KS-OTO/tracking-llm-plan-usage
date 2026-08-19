import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import TokenPlanSection from '../components/TokenPlanSection.vue'
import type { TokenPlanResponse } from '../types'

const fixture: TokenPlanResponse = {
  accounts: [
    {
      keyHint: 'LTAI****wxyz',
      account: {
        accountType: 'ALIYUN',
        name: '主账号',
        accountId: '123456',
        aliyunUid: '123456',
        orgs: [],
      },
      seats: {
        total: 1,
        items: [
          {
            seatId: 'seat-1',
            instanceCode: 'inst-001',
            specType: '专业版',
            status: 'NORMAL',
            assignedStatus: 'ASSIGNED',
            startTime: 1_760_000_000,
            endTime: 1_766_000_000,
            equityList: [
              {
                equityType: 'CREDITS',
                cycleStartTime: 1_760_000_000,
                cycleEndTime: 1_766_000_000,
                cycleTotalValue: 1_000_000,
                cycleSurplusValue: 300_000,
              },
            ],
          },
        ],
      },
      sharedPackages: {
        total: 0,
        items: [],
      },
    },
    {
      keyHint: 'LTAI****failed',
      error: 'NotAuthorized',
    },
  ],
}

describe('TokenPlanSection', () => {
  it('renders account info and seat equity quota', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('主账号')
    expect(text).toContain('UID 123456')
    expect(text).toContain('订阅座席（1）')
    expect(text).toContain('inst-001')
    expect(text).toContain('专业版')
    expect(text).toContain('1.00M')
    expect(text).toContain('300.0K')
  })

  it('shows empty shared packages message', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    expect(wrapper.text()).toContain('没有共享包')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('LTAI****failed')
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
