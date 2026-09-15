import { describe, expect, it } from 'vite-plus/test'
import { nextTick } from 'vue'
import { mountWithTDesign, openDetail } from './mount'

import VolcPlanSection from '../components/VolcPlanSection.vue'
import type { InferenceUsageResponse, VolcPlanResponse } from '../types'

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
    expect(text).toContain('500 / 1.0K')
    expect(text).toContain('9.8K / 10.0K')
    // 套餐类型、调用明细、Coding Plan 额度、推理用量都属于低优先级信息，已全部移出卡片
    expect(text).not.toContain('AgentPlan 套餐')
    expect(text).not.toContain('doubao-pro')
    expect(text).not.toContain('Coding Plan 套餐额度')
    expect(text).not.toContain('总 Token')
  })

  it('moves plan type, detail range and usage table into the detail dialog', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('套餐类型')
    expect(detail).toContain('AgentPlan')
    expect(detail).toContain('2026-08-08 ~ 2026-08-14')
    expect(detail).toContain('模型调用明细（2）')
    expect(detail).toContain('doubao-pro')
    expect(detail).toContain('套餐内')
    expect(detail).toContain('套餐外')
  })

  it('moves the Coding Plan quota block into the detail dialog', async () => {
    const wrapper = mountWithTDesign(VolcPlanSection, { props: baseProps() })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('Coding Plan 套餐额度（1）')
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
