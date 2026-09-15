import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from './mount'

import PlansSection from '../components/PlansSection.vue'
import type { PlansResponse } from '../types'

const openCode: PlansResponse = {
  plans: [
    {
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
    },
  ],
  configured: 1,
}

describe('PlansSection', () => {
  it('renders all three OpenCode Go windows including the 30-day one', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { data: openCode, loading: false, error: null },
    })

    const text = wrapper.text()
    expect(text).toContain('OpenCode Go')
    expect(text).toContain('5 小时窗口')
    expect(text).toContain('每周窗口')
    expect(text).toContain('30 天窗口')
    expect(text).toContain('19.0%')
    expect(text).toContain('5.0%')
  })

  it('renders Kimi and MiniMax plan groups with window progress', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        data: {
          plans: [
            {
              provider: 'Kimi For Coding',
              accounts: [
                {
                  keyHint: 'sk-0****mn',
                  provider: 'Kimi For Coding',
                  windows: [
                    { window: 'fiveHour', percent: 55.5, resetTime: Date.now() + 3_600_000 },
                  ],
                },
              ],
            },
            {
              provider: 'MiniMax',
              accounts: [
                {
                  keyHint: 'sk-0****mm',
                  provider: 'MiniMax',
                  windows: [{ window: 'weekly', percent: 2.5, resetTime: Date.now() + 86_400_000 }],
                },
              ],
            },
          ],
          configured: 2,
        },
        loading: false,
        error: null,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Kimi For Coding')
    expect(text).toContain('55.5%')
    expect(text).toContain('MiniMax')
    expect(text).toContain('2.5%')
  })

  it('prefers the alias over the key hint', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { data: openCode, loading: false, error: null },
    })
    const account = wrapper.find('.account-group')
    expect(account.find('.account-name').text()).toBe('后端团队专用')
    expect(account.find('.key-hint').text()).toBe('sk-0****go')
    expect(account.find('.key-hint').classes()).toContain('key-hint-secondary')
  })

  it('moves account identity and window details into the detail dialog', async () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { data: openCode, loading: false, error: null },
    })
    // 卡片上没有端点与上游状态列
    expect(wrapper.text()).not.toContain('opencode.ai/zen/go/v1/usage')

    const detail = await openDetail(wrapper)
    expect(detail).toContain('别名')
    expect(detail).toContain('opencode.ai/zen/go/v1/usage')
    expect(detail).toContain('重置时间')
    expect(detail).toContain('3 个额度窗口')
  })

  it('flags a rate-limited window instead of silently showing 100% as usage', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        data: {
          plans: [
            {
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
          ],
          configured: 1,
        },
        loading: false,
        error: null,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('上游限流中')
    expect(text).toContain('该窗口已被上游限流')
  })

  it('renders no status tag for a normal window', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        data: {
          plans: [
            {
              provider: 'OpenCode Go',
              accounts: [
                {
                  keyHint: 'sk-0****go',
                  provider: 'OpenCode Go',
                  windows: [{ window: 'weekly', percent: 19, resetTime: Date.now() + 86_400_000 }],
                },
              ],
            },
          ],
          configured: 1,
        },
        loading: false,
        error: null,
      },
    })

    expect(wrapper.text()).not.toContain('上游限流中')
  })

  it('keeps an unrecognised upstream status verbatim', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        data: {
          plans: [
            {
              provider: 'OpenCode Go',
              accounts: [
                {
                  keyHint: 'sk-0****go',
                  provider: 'OpenCode Go',
                  windows: [{ window: 'weekly', percent: 50, resetTime: 0, status: 'exhausted' }],
                },
              ],
            },
          ],
          configured: 1,
        },
        loading: false,
        error: null,
      },
    })

    expect(wrapper.text()).toContain('exhausted')
  })

  it('shows an alert for a failed plan-group account', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        data: {
          plans: [
            {
              provider: 'Kimi For Coding',
              accounts: [{ keyHint: 'sk-9****failed', error: 'InvalidApiKey' }],
            },
          ],
          configured: 1,
        },
        loading: false,
        error: null,
      },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('sk-9****failed')])
  })

  it('shows the not-configured empty state when configured is zero', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: {
        data: { plans: [], configured: 0 },
        loading: false,
        error: null,
        notConfigured: true,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('未配置订阅套餐密钥')
    expect(text).toContain('OPENCODE_GO_API_KEY')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(PlansSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
