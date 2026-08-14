import { describe, expect, it } from 'vite-plus/test'

import {
  parseNovitaBalance,
  parseOpenRouterBalance,
  parseSiliconFlowBalance,
  parseStepFunBalance,
} from './balances.ts'

describe('parseStepFunBalance', () => {
  it('extracts the CNY balance', () => {
    expect(parseStepFunBalance({ balance: 123.45 })).toMatchObject({
      provider: 'StepFun 阶跃星辰',
      balance: 123.45,
      unit: 'CNY',
    })
  })

  it('tolerates string numbers', () => {
    expect(parseStepFunBalance({ balance: '50.5' }).balance).toBe(50.5)
  })
})

describe('parseSiliconFlowBalance', () => {
  it('extracts totalBalance from the data envelope', () => {
    expect(parseSiliconFlowBalance({ data: { totalBalance: 88.8 } })).toMatchObject({
      balance: 88.8,
      unit: 'CNY',
    })
  })

  it('returns 0 when data is missing', () => {
    expect(parseSiliconFlowBalance({}).balance).toBe(0)
  })
})

describe('parseOpenRouterBalance', () => {
  it('computes remaining credits from total minus usage', () => {
    const result = parseOpenRouterBalance({ data: { total_credits: 10, total_usage: 3.5 } })

    expect(result).toMatchObject({ balance: 6.5, total: 10, used: 3.5, unit: 'USD' })
  })

  it('falls back to the top-level object when data is absent', () => {
    expect(parseOpenRouterBalance({ total_credits: 5, total_usage: 1 }).balance).toBe(4)
  })
})

describe('parseNovitaBalance', () => {
  it('converts 0.0001 USD units to USD', () => {
    const result = parseNovitaBalance({ availableBalance: 25000 })

    expect(result).toMatchObject({ balance: 2.5, unit: 'USD' })
  })
})
