import { describe, expect, it } from 'vite-plus/test'
import { ZodError } from 'zod'

import { parseGiteeVoucher } from './gitee.ts'

/** 响应样本取自 docs/参考资料.md（真实控制台抓包）。 */
const userinfoJson = {
  id: 10000001,
  username: 'example-user',
  namespace_path: 'example-user',
}

const walletJson = {
  id: 0,
  account_type: 1,
  balance: '0E-8',
  coupon_cash_balance: 333.134932,
  coupon_compute_balance: '1.5E-8',
  expiring_coupons: [],
}

const couponsJson = {
  total: 1,
  items: [
    {
      id: 10000003,
      catalog: '示例活动奖品',
      type: 'cash',
      amount: '100.00000000',
      balance: '0E-8',
      expired_at: 1800028800000,
      status: 1,
      service_types: ['market'],
      source: 'SYSTEM',
    },
  ],
}

describe('parseGiteeVoucher', () => {
  it('normalizes namespace, wallet balances and coupon details', () => {
    const result = parseGiteeVoucher(userinfoJson, walletJson, couponsJson)
    expect(result.namespace).toBe('example-user')
    expect(result.couponCashBalance).toBe(333.134932)
    expect(result.couponComputeBalance).toBe(1.5e-8)
    expect(result.coupons).toStrictEqual([
      {
        id: 10000003,
        catalog: '示例活动奖品',
        type: 'cash',
        amount: 200,
        balance: 0,
        expiredAt: 1800028800000,
        status: 1,
        serviceTypes: ['market'],
      },
    ])
  })

  it('tolerates scientific-notation amounts and absent coupon list', () => {
    const result = parseGiteeVoucher(
      { namespace_path: 'ns-x' },
      { coupon_cash_balance: '0E-8', coupon_compute_balance: '1.5E-8' },
      {},
    )
    expect(result.namespace).toBe('ns-x')
    expect(result.couponCashBalance).toBe(0)
    expect(result.couponComputeBalance).toBe(1.5e-8)
    expect(result.coupons).toStrictEqual([])
  })

  it('fails loudly when a critical wallet balance field is missing', () => {
    // 关键金额字段缺失属契约漂移：显式失败而非静默展示假零值
    expect(() =>
      parseGiteeVoucher({ namespace_path: 'ns-x' }, { coupon_cash_balance: '0E-8' }, {}),
    ).toThrow(ZodError)
  })
})
