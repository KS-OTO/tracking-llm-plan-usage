import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import VolcPlanSection from '../components/VolcPlanSection.vue'
import type { VolcPlanResponse } from '../types'

const fixture: VolcPlanResponse = {
  accounts: [
    {
      keyHint: 'AKLT****wxyz',
      planType: 'AgentPlan',
      windows: [
        {
          window: 'fiveHour',
          quota: 1000,
          used: 500,
          subscribeTime: 0,
          resetTime: Date.now() + 3_600_000,
        },
        {
          window: 'weekly',
          quota: 10_000,
          used: 9_800,
          subscribeTime: 0,
          resetTime: Date.now() + 86_400_000,
        },
      ],
      details: [
        {
          time: 1_700_000_000_000,
          objectName: 'doubao-pro',
          usage: 1_234,
          unit: 'Tokens',
          billingType: 'WithinPlan',
        },
        {
          time: 1_700_000_100_000,
          objectName: 'doubao-lite',
          usage: 50,
          unit: 'Tokens',
          billingType: 'OutsideOfPlan',
        },
      ],
      detailsStart: '2026-08-08',
      detailsEnd: '2026-08-14',
      codingPlan: {
        status: 'NORMAL',
        updateTimestamp: 1_700_000_000_000,
        windows: [{ level: 'session', percent: 25.5, resetTime: Date.now() + 7_200_000 }],
      },
    },
    {
      keyHint: 'AKLT****failed',
      error: 'NotAuthorized: 无访问权限',
    },
  ],
}

describe('VolcPlanSection', () => {
  it('renders plan type, window usage and quota from fixture data', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('AgentPlan 套餐')
    expect(text).toContain('5 小时窗口')
    expect(text).toContain('每周')
    expect(text).toContain('500 / 1.0K')
    expect(text).toContain('9.8K / 10.0K')
    expect(text).toContain('2026-08-08 ~ 2026-08-14')
    expect(text).toContain('doubao-pro')
    expect(text).toContain('套餐内')
    expect(text).toContain('套餐外')
  })

  it('renders coding plan sub-block with status tag', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('Coding Plan 套餐额度')
    expect(text).toContain('NORMAL')
    expect(text).toContain('25.5%')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('AKLT****failed')
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })

  it('shows section-level error alert when query failed', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: {
        data: null,
        loading: false,
        error: '未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY 环境变量',
      },
    })
    expect(wrapper.text()).toContain('未配置 VOLC_ACCESS_KEY_ID')
  })
})
