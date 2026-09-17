import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from '../test-utils/mount'

import NewApiSection from './NewApiSection.vue'
import type { AccountEnvelope, NewApiAccountData, NewApiResponse } from '../types'

const subscription: NewApiAccountData['subscription'] = {
  status: 'active',
  planId: 2,
  total: 1500,
  used: 48.221358,
  remain: 1451.778642,
  percent: 3.2147572,
  lastResetAt: 1_789_315_200_000,
  nextResetAt: 1_789_920_000_000,
  endAt: 1_850_467_349_000,
  allowWalletOverflow: false,
}

const wallet: NewApiAccountData['wallet'] = {
  remain: 1,
  used: 58_153.03309,
  total: 58_154.03309,
  unlimited: false,
  requestCount: 414_265,
  quotaRemain: 500_000,
  quotaUsed: 29_076_516_545,
}

const account: NewApiAccountData = {
  baseUrl: 'https://ai.example.com/',
  consoleUrl: 'https://ai.example.com/dashboard',
  modelsUrl: 'https://ai.example.com/pricing',
  source: 'api',
  currency: { type: 'USD', unit: '$' },
  username: '许凌志',
  group: 'default',
  mode: 'both',
  billingPreference: 'subscription_first',
  subscription,
  wallet,
  models: [{ model: 'gpt-6-astra', quota: 1434.879338, requests: 3473, tokens: 979_588_145 }],
  windowStart: 1_789_315_200_000,
  windowEnd: 1_789_542_665_000,
  stats: { quota: 1547.324904, rpm: 0, tpm: 0 },
}

function response(accounts: AccountEnvelope<NewApiAccountData>[]): NewApiResponse {
  return { accounts }
}

describe('NewApiSection', () => {
  it('订阅模式给出周期窗口与下次重置时间', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: {
        data: response([{ ...account, keyHint: 'eJ****OLM=', label: '主力站' }]),
        loading: false,
        error: null,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('主力站')
    expect(text).toContain('本周期已用')
    expect(text).toContain('3.2%')
    expect(text).toContain('48.22')
    expect(text).toContain('1,500.00')
    expect(text).toContain('下次重置')
    // 钱包读数同时给出（该账号两种模式并存）
    expect(text).toContain('钱包余额')
    expect(text).toContain('414,265')
    // 模型明细属于弹窗
    expect(text).not.toContain('gpt-6-astra')
  })

  it('进度条百分比只取整数，不把上游的原始精度漏到卡面上', () => {
    // 上游给的是 3.2147572 这种未收敛的原始值，t-progress 会原样打印成
    // "3.2147572%"（真实案例："34.0101024%"）。收敛由 utils.progressPercentage 负责。
    const wrapper = mountWithTDesign(NewApiSection, {
      props: {
        data: response([{ ...account, keyHint: 'eJ****OLM=', label: '主力站' }]),
        loading: false,
        error: null,
      },
    })
    const info = wrapper.find('.t-progress__info')
    expect(info.exists()).toBe(true)
    expect(info.text()).toBe('3%')
  })

  it('纯钱包账号不渲染订阅窗口', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: {
        data: response([
          { ...account, keyHint: 'sk-z****El6l', mode: 'wallet', subscription: null },
        ]),
        loading: false,
        error: null,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('钱包')
    expect(text).not.toContain('本周期已用')
    expect(text).not.toContain('下次重置')
  })

  it('单站点时卡片标题旁给出按站点拼接的外链', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: {
        data: response([{ ...account, keyHint: 'eJ****OLM=' }]),
        loading: false,
        error: null,
      },
    })
    const modelsLink = wrapper.get('a.models-link')
    expect(modelsLink.attributes('href')).toBe('https://ai.example.com/pricing')
    expect(modelsLink.attributes('target')).toBe('_blank')
    // 右上角「控制台」指向自托管站点的 dashboard
    const consoleLink = wrapper.findAll('a').find((a) => a.text().includes('控制台'))
    expect(consoleLink?.attributes('href')).toBe('https://ai.example.com/dashboard')
  })

  it('多站点时不给出卡片级外链（避免一个链接指向不了两个站点）', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: {
        data: response([
          { ...account, keyHint: 'eJ****OLM=' },
          { ...account, keyHint: 'sk-z****El6l', baseUrl: 'https://other.example.com/' },
        ]),
        loading: false,
        error: null,
      },
    })
    expect(wrapper.find('a.models-link').exists()).toBe(false)
    expect(wrapper.findAll('a').some((a) => a.text().includes('控制台'))).toBe(false)
  })

  it('shows neutral empty state when notConfigured', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('未配置 NEWAPI_BASE_URL / NEWAPI_TOKEN')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows failed-account alert with key hint', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: {
        data: response([
          { keyHint: 'sk-z****El6l', error: 'NewApi_HTTP_401: invalid access token' },
        ]),
        loading: false,
        error: null,
      },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sk-z****El6l')])
  })

  it('shows skeleton when loading', () => {
    const wrapper = mountWithTDesign(NewApiSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
