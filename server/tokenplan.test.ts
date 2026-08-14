import { describe, expect, it } from 'vite-plus/test'

import { signAliyunRoa } from './aliyun.ts'

// 该签名实现已经 modelstudio.cn-beijing.aliyuncs.com 真实网关逐项对齐验证
// （服务器回显 string-to-sign 与本地一致，最终请求返回 200）。
describe('signAliyunRoa', () => {
  const base = {
    method: 'GET',
    path: '/tokenplan/subscription/seat-detail',
    query: { PageSize: '10' },
    xAcsHeaders: {
      'x-acs-action': 'GetSubscriptionSeatDetails',
      'x-acs-signature-method': 'HMAC-SHA1',
      'x-acs-signature-nonce': '55ac4ff2-7554-4ef0-9c18-b83a0b645aa7',
      'x-acs-signature-version': '1.0',
      'x-acs-version': '2026-02-10',
    },
    date: 'Wed, 05 Aug 2026 05:43:29 GMT',
    secretKey: 'WoSum5ZCcVB6Iu95jRjjNcEdlLG1xb',
  }

  it('is deterministic for identical inputs', async () => {
    expect(await signAliyunRoa(base)).toBe(await signAliyunRoa(base))
  })

  it('changes when the date changes', async () => {
    expect(await signAliyunRoa(base)).not.toBe(
      await signAliyunRoa({ ...base, date: 'Thu, 06 Aug 2026 05:43:29 GMT' }),
    )
  })

  it('sorts x-acs headers and query params canonically', async () => {
    const a = await signAliyunRoa({
      ...base,
      xAcsHeaders: {
        ...base.xAcsHeaders,
        'x-acs-version': '2026-02-10',
        'x-acs-action': 'GetSubscriptionSeatDetails',
      },
      query: { PageSize: '10', PageNo: '1' },
    })
    const b = await signAliyunRoa({
      ...base,
      xAcsHeaders: {
        'x-acs-signature-version': '1.0',
        'x-acs-version': '2026-02-10',
        'x-acs-signature-nonce': '55ac4ff2-7554-4ef0-9c18-b83a0b645aa7',
        'x-acs-signature-method': 'HMAC-SHA1',
        'x-acs-action': 'GetSubscriptionSeatDetails',
      },
      query: { PageNo: '1', PageSize: '10' },
    })

    expect(a).toBe(b)
  })

  it('produces base64 HMAC-SHA1 output', async () => {
    expect(await signAliyunRoa(base)).toMatch(/^[A-Za-z0-9+/]{27}=$/)
  })
})
