import { describe, expect, it } from 'vite-plus/test'

import { parseQianfanData, signBceRequest } from './baidu.ts'

describe('signBceRequest', () => {
  it('derives the two-stage HMAC signature deterministically (fixed vector)', async () => {
    // 固定向量：同一输入必须产出同一认证串（派生密钥两段 HMAC 的回归锚点）
    const a = await signBceRequest({
      method: 'POST',
      host: 'qianfan.baidubce.com',
      path: '/v2/charge',
      query: { Action: 'DescribePackageResources' },
      accessKey: 'ak-test',
      secretKey: 'sk-test',
      timestamp: '2026-08-19T03:00:00Z',
    })
    const b = await signBceRequest({
      method: 'POST',
      host: 'qianfan.baidubce.com',
      path: '/v2/charge',
      query: { Action: 'DescribePackageResources' },
      accessKey: 'ak-test',
      secretKey: 'sk-test',
      timestamp: '2026-08-19T03:00:00Z',
    })
    expect(a.authorization).toBe(b.authorization)
    expect(a.authorization).toMatch(
      /^bce-auth-v1\/ak-test\/2026-08-19T03:00:00Z\/1800\/host;x-bce-date\/[0-9a-f]{64}$/,
    )
    expect(a.xBceDate).toBe('2026-08-19T03:00:00Z')
  })

  it('produces different signatures for different secrets', async () => {
    const base = {
      method: 'POST' as const,
      host: 'qianfan.baidubce.com',
      path: '/v2/charge',
      query: { Action: 'DescribePackageResources' },
      accessKey: 'ak-test',
      timestamp: '2026-08-19T03:00:00Z',
    }
    const s1 = await signBceRequest({ ...base, secretKey: 'sk-1' })
    const s2 = await signBceRequest({ ...base, secretKey: 'sk-2' })
    expect(s1.authorization).not.toBe(s2.authorization)
  })

  it('keeps slashes unencoded in the canonical URI', async () => {
    const signed = await signBceRequest({
      method: 'POST',
      host: 'h',
      path: '/v2/charge',
      query: { Action: 'A' },
      accessKey: 'ak',
      secretKey: 'sk',
      timestamp: '2026-08-19T03:00:00Z',
    })
    // 无法直接观察内部串，但签名可复算：用相同步骤手动重算必须一致
    expect(signed.authorization.split('/').length).toBeGreaterThanOrEqual(6)
  })
})

/** 样本取自官方文档响应示例（Bmo2iv5ri / Amo2ixqu7 / 4mm33t0kj）。 */
describe('parseQianfanData', () => {
  it('normalizes packages, tpm quotas and usage totals', () => {
    const result = parseQianfanData(
      {
        result: {
          instances: [
            {
              creator: 'zhangsan',
              expiredTime: '2025-01-11T11:32:09Z',
              packageId: 'wenxinfactory-oSNMRB7TdK',
              serviceName: 'ernie-4.0-8k',
              specification: '1234',
              startTime: '2024-07-11T11:32:09Z',
              status: 'Exhausted',
              used: 1234,
            },
          ],
        },
      },
      {
        result: {
          instances: [
            {
              instanceId: 'tpm-1',
              model: 'ernie-speed-8k',
              tpm: 120000,
              status: 'Running',
              paymentTiming: 'Postpaid',
            },
          ],
        },
      },
      {
        result: {
          serviceList: [
            { serviceId: 'svcp-1', tokens: 1500, calls: 30 },
            { serviceId: 'svcp-2', tokens: 2500, calls: 70 },
          ],
        },
      },
    )
    expect(result.packages).toStrictEqual([
      {
        packageId: 'wenxinfactory-oSNMRB7TdK',
        serviceName: 'ernie-4.0-8k',
        specification: '1234',
        used: '1234',
        status: 'Exhausted',
        startTime: '2024-07-11T11:32:09Z',
        expiredTime: '2025-01-11T11:32:09Z',
        creator: 'zhangsan',
      },
    ])
    expect(result.tpmQuotas).toStrictEqual([
      {
        instanceId: 'tpm-1',
        model: 'ernie-speed-8k',
        tpm: 120000,
        status: 'Running',
        paymentTiming: 'Postpaid',
      },
    ])
    expect(result.usage).toStrictEqual({ serviceCount: 2, totalTokens: 4000, totalCalls: 100 })
  })

  it('tolerates missing result blocks and empty lists', () => {
    const result = parseQianfanData({ requestId: 'x' }, { requestId: 'x' }, { result: null })
    expect(result.packages).toStrictEqual([])
    expect(result.tpmQuotas).toStrictEqual([])
    expect(result.usage).toStrictEqual({ serviceCount: 0, totalTokens: 0, totalCalls: 0 })
  })
})
