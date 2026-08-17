import { describe, expect, it } from 'vite-plus/test'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import OverviewTab from '../components/OverviewTab.vue'
import { useDashboardStore } from '../stores/dashboard'

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
