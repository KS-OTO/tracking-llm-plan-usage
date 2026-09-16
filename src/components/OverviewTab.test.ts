import { describe, expect, it } from 'vite-plus/test'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import OverviewTab from './OverviewTab.vue'
import { useDashboardStore } from '../stores/dashboard'

import { mountWithTDesign } from '../test-utils/mount'

/** 构造首载失败场景（data=null + error）：失败平台必须出「查询失败」卡而非消失。 */
function mountWithStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDashboardStore()
  store.deepseek = { data: null, error: '无法连接后端 API 服务', notConfigured: false }
  store.gitee = {
    data: {
      accounts: [
        {
          keyHint: 'UC03****xxxx',
          balance: 45.5,
          usedAmount: 54.5,
          totalAmount: 100,
          details: [],
        },
      ],
    },
    error: null,
    notConfigured: false,
  }
  store.loading = false
  const wrapper = mount(OverviewTab, {
    global: { plugins: [pinia] },
  })
  return { wrapper, store }
}

function giteeAccount(keyHint: string) {
  return { keyHint, balance: 45.5, usedAmount: 54.5, totalAmount: 100, details: [] }
}

/**
 * 构造「账号数不同」的多平台场景，用于断言导航卡顺序：
 * 模力方舟 2 个 Key、百度千帆 1 个（B）、DeepSeek 1 个（D）。
 */
function mountWithCounts() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDashboardStore()
  store.gitee = {
    data: { accounts: [giteeAccount('UC03****AKNM'), giteeAccount('IYOV****FQK4')] },
    error: null,
    notConfigured: false,
  }
  store.deepseek = {
    data: {
      accounts: [
        {
          keyHint: 'sk-5****f68d',
          isAvailable: true,
          balances: [{ currency: 'CNY', total: 7.97, granted: 0, toppedUp: 0 }],
        },
      ],
    },
    error: null,
    notConfigured: false,
  }
  store.baidu = {
    data: {
      accounts: [
        {
          keyHint: 'ALTA****xD6n',
          packages: [],
          tpmQuotas: [],
          usage: { totalTokens: 0, totalCalls: 0, serviceCount: 0 },
        },
      ],
    },
    error: null,
    notConfigured: false,
  }
  store.loading = false
  const wrapper = mountWithTDesign(OverviewTab, { global: { plugins: [pinia] } })
  return wrapper
}

describe('OverviewTab failure cards', () => {
  it('shows a danger card with 查询失败 when the whole slice failed (data=null + error)', () => {
    const { wrapper } = mountWithStore()
    const text = wrapper.text()
    expect(text).toContain('DeepSeek')
    expect(text).toContain('查询失败')
    // 成功平台照常显示数值
    expect(text).toContain('45.50')
  })

  it('keeps healthy platform cards alongside failed ones', () => {
    const { wrapper } = mountWithStore()
    expect(wrapper.text()).toContain('模力方舟')
  })
})

describe('OverviewTab nav card ordering', () => {
  it('puts platforms with more keys first, then sorts the rest by initial', () => {
    const wrapper = mountWithCounts()
    const names = wrapper.findAll('.nav-card .nav-name').map((node) => node.text())
    // 模力方舟 2 个 Key 优先；其余同为 1 个 Key，按首字母 B（百度千帆）→ D（DeepSeek）
    expect(names).toEqual(['模力方舟', '百度千帆', 'DeepSeek'])
  })
})

describe('OverviewTab 可用模型链接', () => {
  it('gives every platform nav card a new-tab docs link', () => {
    const wrapper = mountWithCounts()
    const links = wrapper.findAll('.nav-card a.models-link')
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toContain('noopener')
    }
    const giteeCard = wrapper.findAll('.nav-card').find((card) => card.text().includes('模力方舟'))
    expect(giteeCard?.find('a.models-link').attributes('href')).toBe(
      'https://ai.gitee.com/serverless-api',
    )
  })

  it('does not scroll to the platform card when the docs link is clicked', async () => {
    const wrapper = mountWithCounts()
    // 整卡点击 = 跳到该平台；链接点击必须 stop，否则「打开文档」会顺带把页面滚走
    await wrapper.findAll('.nav-card a.models-link')[0]?.trigger('click')
    expect(wrapper.emitted('jump')).toBeUndefined()
  })
})
