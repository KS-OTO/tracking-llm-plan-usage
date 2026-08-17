import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign } from './mount'

import VolcUsageSection from '../components/VolcUsageSection.vue'
import type { InferenceUsageResponse } from '../types'

const fixture: InferenceUsageResponse = {
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
    {
      keyHint: 'AKLT****failed',
      error: 'NetworkError',
    },
  ],
}

describe('VolcUsageSection', () => {
  it('renders per-account token totals computed from rows', () => {
    const wrapper = mountWithTDesign(VolcUsageSection, {
      props: { data: fixture, loading: false, error: null, model: '' },
    })
    const text = wrapper.text()
    expect(text).toContain('总 Token')
    expect(text).toContain('5.0K')
    expect(text).toContain('2026-08-14')
    expect(text).toContain('2026-08-13')
  })

  it('renders the model filter input and forwards update:model', async () => {
    const wrapper = mountWithTDesign(VolcUsageSection, {
      props: { data: fixture, loading: false, error: null, model: '' },
    })
    const input = wrapper.find('input')
    await input.setValue('doubao-pro')
    expect(wrapper.emitted('update:model')?.[0]).toStrictEqual(['doubao-pro'])
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(VolcUsageSection, {
      props: { data: fixture, loading: false, error: null, model: '' },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.length).toBe(1)
    expect(alerts[0]!.text()).toContain('AKLT****failed')
  })

  it('renders zero-value statistics for an account with empty rows', () => {
    const wrapper = mountWithTDesign(VolcUsageSection, {
      props: {
        data: {
          accounts: [
            { keyHint: 'AKLT****empty', rows: [], start: '2026-08-08', end: '2026-08-14' },
          ],
        },
        loading: false,
        error: null,
        model: '',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('AKLT****empty')
    expect(text).toContain('总 Token')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows empty state when no account is configured', () => {
    const wrapper = mountWithTDesign(VolcUsageSection, {
      props: { data: { accounts: [] }, loading: false, error: null, model: '' },
    })
    expect(wrapper.text()).toContain('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY')
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(VolcUsageSection, {
      props: { data: null, loading: true, error: null, model: '' },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })
})
