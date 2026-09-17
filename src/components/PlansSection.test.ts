import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import PlansSection from './PlansSection.vue'
import type { PlanGroup } from '../types'

const openCode: PlanGroup = {
  provider: 'OpenCode Go',
  accounts: [
    {
      keyHint: 'sk-0****go',
      label: '后端团队专用',
      provider: 'OpenCode Go',
      windows: [
        { window: 'fiveHour', percent: 0, resetTime: Date.now() + 3_600_000 },
        { window: 'weekly', percent: 19, resetTime: Date.now() + 86_400_000 },
        { window: 'monthly', percent: 5, resetTime: Date.now() + 86_400_000 },
      ],
    },
  ],
}

describe('PlansSection', () => {
  it('titles the card with the platform name instead of a generic group name', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { group: openCode },
    })
    // 卡片标题即平台名（用户实测：2 个 OpenCode Go Key，标题却是「订阅套餐」）。
    // 标题槽里除平台名外还有「可用模型」外链，因此精确取平台名那个 span，不用整个标题文本
    expect(wrapper.find('.section-title > span').text()).toBe('OpenCode Go')
    expect(wrapper.text()).not.toContain('订阅套餐')
  })

  it('renders all three OpenCode Go windows including the 30-day one', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { group: openCode },
    })

    const text = wrapper.text()
    expect(text).toContain('5 小时窗口')
    expect(text).toContain('每周窗口')
    expect(text).toContain('30 天窗口')
    expect(text).toContain('19.0%')
    expect(text).toContain('5.0%')
  })

  it('renders the Kimi and MiniMax groups as their own cards', () => {
    const cases: Array<[string, number]> = [
      ['Kimi For Coding', 55.5],
      ['MiniMax', 2.5],
    ]
    for (const [provider, percent] of cases) {
      const wrapper = mountWithTDesign(PlansSection, {
        props: {
          group: {
            provider,
            accounts: [
              {
                keyHint: `sk-0****${provider.length}`,
                provider,
                windows: [{ window: 'weekly', percent, resetTime: Date.now() + 86_400_000 }],
              },
            ],
          },
        },
      })
      expect(wrapper.find('.section-title > span').text()).toBe(provider)
      expect(wrapper.text()).toContain(`${percent.toFixed(1)}%`)
    }
  })

  it('prefers the alias over the key hint', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { group: openCode },
    })
    const account = wrapper.find('.account-group')
    expect(account.find('.account-name').text()).toBe('后端团队专用')
    expect(account.find('.key-hint').text()).toBe('sk-0****go')
    expect(account.find('.key-hint').classes()).toContain('key-hint-secondary')
  })

  it('moves account identity and window details into the detail dialog', async () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { group: openCode },
    })
    // 卡片上没有端点与上游状态列
    expect(wrapper.text()).not.toContain('opencode.ai/zen/go/v1/usage')

    const detail = await openDetail(wrapper)
    expect(detail).toContain('别名')
    expect(detail).toContain('OpenCode Go')
    expect(detail).toContain('opencode.ai/zen/go/v1/usage')
    expect(detail).toContain('重置时间')
    expect(detail).toContain('3 个额度窗口')
  })

  it('flags a rate-limited window instead of silently showing 100% as usage', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        group: {
          provider: 'OpenCode Go',
          accounts: [
            {
              keyHint: 'sk-0****go',
              provider: 'OpenCode Go',
              windows: [
                {
                  window: 'monthly',
                  percent: 100,
                  resetTime: Date.now() + 86_400_000,
                  status: 'rate-limited',
                },
              ],
            },
          ],
        },
      },
    })

    const text = wrapper.text()
    expect(text).toContain('上游限流中')
    expect(text).toContain('该窗口已被上游限流')
  })

  it('renders no status tag for a normal window', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        group: {
          provider: 'OpenCode Go',
          accounts: [
            {
              keyHint: 'sk-0****go',
              provider: 'OpenCode Go',
              windows: [{ window: 'weekly', percent: 19, resetTime: Date.now() + 86_400_000 }],
            },
          ],
        },
      },
    })

    expect(wrapper.text()).not.toContain('上游限流中')
  })

  it('keeps an unrecognised upstream status verbatim', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        group: {
          provider: 'OpenCode Go',
          accounts: [
            {
              keyHint: 'sk-0****go',
              provider: 'OpenCode Go',
              windows: [{ window: 'weekly', percent: 50, resetTime: 0, status: 'exhausted' }],
            },
          ],
        },
      },
    })

    expect(wrapper.text()).toContain('exhausted')
  })

  it('shows an alert for a failed account', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        group: {
          provider: 'Kimi For Coding',
          accounts: [{ keyHint: 'sk-9****failed', error: 'InvalidApiKey' }],
        },
      },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sk-9****failed')])
  })

  it('wraps the stacked windows in .window-list so parallel accounts line up', () => {
    // 两个账号各 3 个窗口：其中一个多一行「上游限流」说明
    const group: PlanGroup = {
      provider: 'OpenCode Go',
      accounts: [
        {
          keyHint: 'sk-0****go',
          provider: 'OpenCode Go',
          windows: [
            { window: 'fiveHour', percent: 0, resetTime: 0 },
            { window: 'weekly', percent: 19, resetTime: 0 },
            { window: 'monthly', percent: 5, resetTime: 0 },
          ],
        },
        {
          keyHint: 'sk-1****go',
          provider: 'OpenCode Go',
          windows: [
            { window: 'fiveHour', percent: 0, resetTime: 0 },
            { window: 'weekly', percent: 100, resetTime: 0, status: 'rate-limited' },
            { window: 'monthly', percent: 5, resetTime: 0 },
          ],
        },
      ],
    }
    const wrapper = mountWithTDesign(PlansSection, { props: { group } })

    // .window-list 负责「间距 + N 个窗口块各占 1/N 高度」（见 assets/layout.css）：
    // 曾经窗口块是 .account-group 的直接子元素、靠 `.window-block + .window-block` 的
    // margin 拉间距，margin 会泄漏进网格项，并排账号的窗口块因此逐块错位。
    const lists = wrapper.findAll('.window-list')
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      const children = Array.from(list.element.children)
      expect(children).toHaveLength(3)
      expect(children.every((child) => child.classList.contains('window-block'))).toBe(true)
    }
  })
})
