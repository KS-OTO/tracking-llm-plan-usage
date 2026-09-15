import { describe, expect, it } from 'vite-plus/test'

import AccountSection from '../components/AccountSection.vue'
import { mountWithTDesign } from './mount'

/** 卡片标题区的外链（标题插槽内），不是卡内的账号链接。 */
function modelsLink(wrapper: ReturnType<typeof mountWithTDesign>) {
  return wrapper.find('.t-card__header a.models-link')
}

describe('AccountSection 可用模型链接', () => {
  it('renders a new-tab docs link beside the platform name', () => {
    const wrapper = mountWithTDesign(AccountSection, {
      props: { title: 'DeepSeek 余额' },
    })
    const link = modelsLink(wrapper)
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://api-docs.deepseek.com/zh-cn/quick_start/pricing/')
    // target=_blank 必须配 rel=noopener：否则新标签页可通过 window.opener 反向操作本页
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.text()).toContain('可用模型')
    expect(wrapper.text()).toContain('DeepSeek 余额')
  })

  it('resolves the URL from the platform name for every card variant', () => {
    const gitee = mountWithTDesign(AccountSection, { props: { title: '模力方舟（Gitee AI）' } })
    expect(modelsLink(gitee).attributes('href')).toBe('https://ai.gitee.com/serverless-api')

    const volc = mountWithTDesign(AccountSection, { props: { title: '火山方舟 Agent Plan' } })
    expect(modelsLink(volc).attributes('href')).toContain('console.volcengine.com')

    // 订阅套餐卡标题就是平台名（OpenCode Go / Kimi / MiniMax）
    const opencode = mountWithTDesign(AccountSection, { props: { title: 'OpenCode Go' } })
    expect(modelsLink(opencode).attributes('href')).toContain('opencode.ai')
  })

  it('renders no link when the platform has no known docs', () => {
    const wrapper = mountWithTDesign(AccountSection, { props: { title: '订阅套餐' } })
    expect(modelsLink(wrapper).exists()).toBe(false)
  })

  it('lets the caller override the resolved URL', () => {
    const wrapper = mountWithTDesign(AccountSection, {
      props: { title: '百度千帆', modelsUrl: 'https://example.com/models' },
    })
    expect(modelsLink(wrapper).attributes('href')).toBe('https://example.com/models')
  })

  it('labels the link with the platform name for screen readers', () => {
    const wrapper = mountWithTDesign(AccountSection, { props: { title: '百度千帆' } })
    expect(modelsLink(wrapper).attributes('aria-label')).toContain('百度千帆')
  })
})
