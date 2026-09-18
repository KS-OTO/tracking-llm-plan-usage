import { describe, expect, it } from 'vite-plus/test'
import { ZodError } from 'zod'

import { normalizeSessionCookie, parseGiteeVoucher } from './gitee.ts'

/**
 * 响应样本取自控制台抓包（原样存档见 `docs/参考资料.md`）。
 *
 * 其中的账号标识（id / namespace / 用户名 / 代金券码）**已全部替换为占位值**，
 * 只保留字段名与类型——仓库公开后请不要把真实抓包粘回来。
 */
const userinfoJson = {
  id: 10000001,
  username: 'example-ns',
  namespace_path: 'example-ns',
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
    expect(result.namespace).toBe('example-ns')
    expect(result.couponCashBalance).toBe(333.134932)
    expect(result.couponComputeBalance).toBe(1.5e-8)
    expect(result.coupons).toStrictEqual([
      {
        id: 10000003,
        catalog: '示例活动奖品',
        type: 'cash',
        amount: 100,
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

describe('normalizeSessionCookie', () => {
  it('passes through plain cookie text unchanged', () => {
    const raw = 'a=1; session-token=xyz'
    expect(normalizeSessionCookie(raw)).toBe(raw)
  })

  it('decodes percent-encoded cookie values (EdgeOne EnvVars format)', () => {
    const encoded = encodeURIComponent('a=1; session-token=xyz; ns=git-example')
    expect(normalizeSessionCookie(encoded)).toBe('a=1; session-token=xyz; ns=git-example')
  })

  it('leaves percent signs alone when the value is not an encoded cookie', () => {
    expect(normalizeSessionCookie('token%invalid')).toBe('token%invalid')
  })

  it('restores a real Gitee cookie header with spaces and semicolons', () => {
    // 平台面板（Vercel / EdgeOne）直接拒绝含空格的值，而整段 Cookie 天生带 `; `，
    // 所以线上只能存 encodeURIComponent 后的形态；服务端必须能原样还原。
    const raw = 'uuser_locale=zh-CN; abymg_id=abc123; BEC=7f3d; session-token=xyz'
    expect(normalizeSessionCookie(encodeURIComponent(raw))).toBe(raw)
  })

  it('restores a cookie whose spaces were encoded by hand', () => {
    // 只把空格换成 %20、分号保持原样也能还原：启发式只看「含 % 且解码后有 =」
    const raw = 'a=1; session-token=xyz'
    expect(normalizeSessionCookie(raw.replaceAll(' ', '%20'))).toBe(raw)
  })
})
