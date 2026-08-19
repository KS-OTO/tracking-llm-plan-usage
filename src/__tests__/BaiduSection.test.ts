import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import BaiduSection from '../components/BaiduSection.vue'
import type { BaiduQianfanResponse } from '../types'

/** 响应样本结构取自官方文档（Amo2ixqu7 / Qmo1geq40 / 4mm33t0kj）。 */
const fixture: BaiduQianfanResponse = {
  accounts: [
    {
      keyHint: 'ALTA****xD6n',
      label: '百度主号',
      packages: [
        {
          packageId: 'wenxinfactory-oSNMRB7TdK',
          serviceName: 'ernie-4.5-turbo-128k',
          specification: '1000000',
          used: '250000',
          status: 'Active',
          startTime: '2026-07-11T11:32:09Z',
          expiredTime: '2027-01-11T11:32:09Z',
          creator: 'owner',
        },
      ],
      tpmQuotas: [
        {
          instanceId: 'tpm-1',
          model: 'ernie-speed-8k',
          tpm: 120000,
          status: 'Running',
          paymentTiming: 'Postpaid',
        },
      ],
      usage: { serviceCount: 3, totalTokens: 4_000_000, totalCalls: 1200 },
    },
    {
      keyHint: 'ALTA****fail',
      error: 'NotAuthorized: 无访问权限',
    },
  ],
}

describe('BaiduSection', () => {
  it('renders usage statistics, package and TPM tables with alias', () => {
    const wrapper = mountWithTDesign(BaiduSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('百度主号')
    expect(text).toContain('ALTA****xD6n')
    expect(text).toContain('4.00M')
    expect(text).toContain('1,200')
    expect(text).toContain('ernie-4.5-turbo-128k')
    expect(text).toContain('使用中')
    expect(text).toContain('120,000')
    expect(text).toContain('后付费')
  })

  it('shows an alert for the failed account with alias + keyHint', () => {
    const wrapper = mountWithTDesign(BaiduSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('ALTA****fail')
  })

  it('renders neutral empty state when notConfigured', () => {
    const wrapper = mountWithTDesign(BaiduSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 BAIDU_ACCESS_KEY_ID / BAIDU_SECRET_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows empty-package hint when account has no packages', () => {
    const wrapper = mountWithTDesign(BaiduSection, {
      props: {
        data: {
          accounts: [
            {
              keyHint: 'ALTA****xD6n',
              packages: [],
              tpmQuotas: [],
              usage: { serviceCount: 0, totalTokens: 0, totalCalls: 0 },
            },
          ],
        },
        loading: false,
        error: null,
      },
    })
    expect(wrapper.text()).toContain('无量包')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(BaiduSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
