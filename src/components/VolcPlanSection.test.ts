import { describe, expect, it } from 'vite-plus/test'
import { nextTick } from 'vue'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import VolcPlanSection from './VolcPlanSection.vue'
import type { InferenceUsageResponse, VolcPlanData, VolcPlanResponse } from '../types'

/** 一个成功账号；`overrides` 用来构造「未订阅」「缺窗口」这类变体。 */
function volcAccount(overrides: Partial<VolcPlanData> = {}) {
  return {
    keyHint: 'AKLT****wxyz',
    planType: 'Medium',
    personalPlan: {
      planType: 'Medium',
      status: 'Running',
      startTime: '2026-07-06T09:31:24Z',
      endTime: '2026-10-06T15:59:59Z',
      autoRenew: true,
    },
    windows: [
      {
        window: 'fiveHour',
        quota: 1000,
        used: 500,
        subscribeTime: 0,
        resetTime: Date.now() + 3_600_000,
      },
      {
        window: 'daily',
        quota: 50_000,
        used: 0,
        subscribeTime: 0,
        resetTime: Date.now() + 9_000_000,
      },
      {
        window: 'weekly',
        quota: 10_000,
        used: 9_800,
        subscribeTime: 0,
        resetTime: Date.now() + 86_400_000,
      },
    ] as VolcPlanData['windows'],
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
    ] as VolcPlanData['details'],
    detailsStart: '2026-08-08',
    detailsEnd: '2026-08-14',
    codingPlan: {
      status: 'NORMAL',
      updateTimestamp: 1_700_000_000_000,
      windows: [{ level: 'session', percent: 25.5, resetTime: Date.now() + 7_200_000 }],
    },
    ...overrides,
  }
}

const fixture: VolcPlanResponse = {
  accounts: [volcAccount(), { keyHint: 'AKLT****failed', error: 'NotAuthorized: 无访问权限' }],
}

/** 推理用量与 Agent Plan 是同一对 AK/SK，按 keyHint 配对。 */
const inference: InferenceUsageResponse = {
  accounts: [
    {
      keyHint: 'AKLT****wxyz',
      rows: [
        {
          day: '2026-08-13',
          inputTokens: 1_000,
          outputTokens: 2_000,
          totalTokens: 3_000,
          requests: 10,
          imageCount: 0,
        },
        {
          day: '2026-08-14',
          inputTokens: 500,
          outputTokens: 1_500,
          totalTokens: 2_000,
          requests: 5,
          imageCount: 0,
        },
      ],
      start: '2026-08-08',
      end: '2026-08-14',
    },
  ],
}

function baseProps() {
  return { data: fixture, loading: false, error: null, inference, inferenceError: null, model: '' }
}

describe('VolcPlanSection', () => {
  it('keeps only the Agent Plan windows on the card', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const text = wrapper.text()
    expect(text).toContain('5 小时窗口')
    expect(text).toContain('每周')
    expect(text).toContain('500 / 1.0K AFP')
    expect(text).toContain('9.8K / 10.0K AFP')
    // 套餐类型、调用明细、Coding Plan 额度、推理用量都属于低优先级信息，已全部移出卡片
    expect(text).not.toContain('Medium 套餐')
    expect(text).not.toContain('doubao-pro')
    expect(text).not.toContain('Coding Plan 套餐额度')
    expect(text).not.toContain('总 Token')
  })

  it('labels AFPDaily as the model daily quota and says which models it applies to', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const text = wrapper.text()
    // AFPDaily 不是文本模型的「每日窗口」：上游口径是模型日额度，
    // 仅图片/视频/语音与 Harness 计入。只跑文本时它恒为 0，不该被读成数据坏了。
    expect(text).not.toContain('每日窗口')
    expect(text).toContain('模型日额度')
    expect(text).toContain('仅图片生成 / 视频生成 / 语音模型与 Harness 计入')
    expect(text).toContain('0 / 50.0K AFP')
  })

  it('moves plan type, detail range and usage table into the detail dialog', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('套餐类型')
    expect(detail).toContain('Medium')
    expect(detail).toContain('2026-08-08 ~ 2026-08-14')
    expect(detail).toContain('模型调用明细（2）')
    expect(detail).toContain('doubao-pro')
    expect(detail).toContain('套餐内')
    expect(detail).toContain('套餐外')
  })

  it('surfaces the personal plan status, validity window and auto-renew', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('套餐状态')
    expect(detail).toContain('Running')
    expect(detail).toContain('生效时间')
    expect(detail).toContain('到期时间')
    expect(detail).toContain('自动续费')
    expect(detail).toContain('已开启')
  })

  it('falls back to em dashes when the account has no personal plan', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: {
        ...baseProps(),
        data: { accounts: [volcAccount({ personalPlan: null })] },
      },
    })
    const detail = await openDetail(wrapper)
    // 未订阅/已回收：字段仍在，值落成 —（不伪造 0，也不隐藏字段）
    expect(detail).toContain('套餐状态')
    expect(detail).toContain('自动续费')
    expect(detail).not.toContain('已开启')
  })

  it('moves the Coding Plan quota block into the detail dialog', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const detail = await openDetail(wrapper)
    // Coding Plan 窗口与 Agent Plan 窗口并排落在「额度窗口」分节里，靠标签前缀区分
    //（它不进卡面：同一对 AK/SK 下会出现两个「5 小时窗口」）
    expect(detail).toContain('Coding Plan · 5 小时窗口')
    expect(detail).toContain('Coding Plan 状态')
    expect(detail).toContain('NORMAL')
    expect(detail).toContain('5 小时窗口')
    expect(detail).toContain('25.5%')
  })

  it('merges the inference usage block into the detail dialog', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('推理用量（2026-08-08 ~ 2026-08-14）')
    expect(detail).toContain('总 Token')
    expect(detail).toContain('5.0K')
    expect(detail).toContain('2026-08-14')
  })

  it('forwards the model filter change out of the dialog', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    await openDetail(wrapper)

    const input = document.body.querySelector<HTMLInputElement>('.t-dialog__ctx input')
    expect(input?.getAttribute('placeholder')).toBe('模型过滤（留空 = 全部）')
    if (input) {
      input.value = 'doubao-pro'
      input.dispatchEvent(new Event('input'))
    }
    await nextTick()
    expect(wrapper.emitted('update:model')).toBeTruthy()
  })

  it('explains the missing inference slice inside the dialog instead of hiding it', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: {
        ...baseProps(),
        inference: null,
        inferenceError: '无法连接后端 API 服务',
      },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('推理用量')
    expect(detail).toContain('无法连接后端 API 服务')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('AKLT****failed')])
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: {
        ...baseProps(),
        data: null,
        inference: null,
        notConfigured: true,
      },
    })
    expect(wrapper.text()).toContain('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: { ...baseProps(), data: null, inference: null, loading: true },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })

  it('shows section-level error alert when query failed', () => {
    const wrapper = mountWithTDesign(VolcPlanSection, {
      props: {
        ...baseProps(),
        data: null,
        inference: null,
        error: '未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY 环境变量',
      },
    })
    expect(wrapper.text()).toContain('未配置 VOLC_ACCESS_KEY_ID')
  })
})
