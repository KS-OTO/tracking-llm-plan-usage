import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import OpenRouterSection from './OpenRouterSection.vue'
import type { OpenRouterDetailResponse } from '../types'

interface OkAccount {
  keyHint: string
  label: string
  provider: string
  balance: number
  total: number
  used: number
  unit: string
  isFreeTier: boolean
  isManagementKey: boolean
  limit: number | null
  limitRemaining: number | null
  limitReset: string | null
  expiresAt: string | null
  usageDaily: number
  usageWeekly: number
  usageMonthly: number
}

const okAccount: OkAccount = {
  keyHint: 'sk-o****7d7f',
  label: '主力',
  provider: 'OpenRouter',
  balance: 74.75,
  total: 100.5,
  used: 25.75,
  unit: 'USD',
  isFreeTier: false,
  isManagementKey: false,
  limit: 100,
  limitRemaining: 74.5,
  limitReset: 'monthly',
  expiresAt: '2027-12-31T23:59:59Z',
  usageDaily: 1.5,
  usageWeekly: 10.25,
  usageMonthly: 25.5,
}

const fixture: OpenRouterDetailResponse = {
  accounts: [okAccount, { keyHint: 'sk-o****free', error: 'Unauthorized: Key invalid' }],
}

describe('OpenRouterSection', () => {
  it('keeps the credit readings on the card', () => {
    const wrapper = mountWithTDesign(OpenRouterSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('主力')
    expect(text).toContain('74.75')
    expect(text).toContain('限额剩余')
    expect(text).toContain('今日用量')
    expect(text).toContain('1.50')
    // 密钥元数据与周月用量已移出卡片
    expect(text).not.toContain('每月重置')
    expect(text).not.toContain('10.25')
  })

  it('moves key metadata and weekly/monthly usage into the detail dialog', async () => {
    const wrapper = mountWithTDesign(OpenRouterSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('每月重置')
    expect(detail).toContain('2027-12-31 23:59:59')
    expect(detail).toContain('10.25')
    expect(detail).toContain('25.50')
    expect(detail).toContain('100.50')
    expect(detail).toContain('管理密钥')
  })

  it('shows neutral empty state when notConfigured', () => {
    const wrapper = mountWithTDesign(OpenRouterSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 OPENROUTER_API_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows failed-account alert with key hint', () => {
    const wrapper = mountWithTDesign(OpenRouterSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sk-o****free')])
  })

  it('shows skeleton when loading', () => {
    const wrapper = mountWithTDesign(OpenRouterSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
