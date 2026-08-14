import { describe, expect, it } from 'vite-plus/test'

import { signVolcRequest, type VolcSignInput } from './sign.ts'

// Worked examples from https://www.volcengine.com/docs/6369/67269 (签名方法).
const AK = 'AKLTYWViMTVmZGYzM2E0NDI5Mzk2MDZjNjFmMjc2MjRjMzg'
const SK = 'WkRZeE1EQmxPVGhsWWpWak5HVmtNbUUxTXpZeU9UVXlOMlE1TmpZeVlqTQ=='
const NOW = new Date('2025-03-29T18:09:37Z')

describe('signVolcRequest', () => {
  it('matches the documented POST example end to end', async () => {
    const result = await signVolcRequest({
      accessKey: AK,
      secretKey: SK,
      method: 'POST',
      host: 'billing.volcengineapi.com',
      query: { Action: 'ListBill', Version: '2022-01-01' },
      body: '{"Limit":10,"BillPeriod":"2023-08"}',
      region: 'cn-beijing',
      service: 'billing',
      now: NOW,
    })

    expect(result.xDate).toBe('20250329T180937Z')
    expect(result.signedHeaders).toBe('host;x-date')
    expect(result.canonicalRequestHash).toBe(
      '27383e3b56d03850f5634483527fbddcbf06cf98de1bc8a6679ef2300bff3b15',
    )
    expect(result.authorization).toBe(
      'HMAC-SHA256 Credential=AKLTYWViMTVmZGYzM2E0NDI5Mzk2MDZjNjFmMjc2MjRjMzg/20250329/cn-beijing/billing/request, SignedHeaders=host;x-date, Signature=5e8480ceea12d0000a23c054151c50dd02c1a7dec835004057d19f13d53a7658',
    )
  })

  it('matches the documented GET example (empty body)', async () => {
    const result = await signVolcRequest({
      accessKey: AK,
      secretKey: SK,
      method: 'GET',
      host: 'billing.volcengineapi.com',
      query: { Action: 'QueryBalanceAcct', Version: '2022-01-01' },
      region: 'cn-beijing',
      service: 'billing',
      now: NOW,
    })

    expect(result.canonicalRequestHash).toBe(
      '43171c1658c64b5db55c58d54988a4598d2d09a5613136beaa5eef40eae6e2c1',
    )
    expect(result.authorization).toContain(
      'Signature=1eda9e7e6b1728151a8e8791fdaf67cfbd28bd5c80d0fce2eb208746cf483105',
    )
  })

  it('signs the x-content-sha256 header when passed (Ark control-plane style)', async () => {
    const body = '{}'
    const payloadHash = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
    const result = await signVolcRequest({
      accessKey: AK,
      secretKey: SK,
      method: 'POST',
      host: 'ark.cn-beijing.volces.com',
      query: { Action: 'GetAFPUsage', Version: '2024-01-01' },
      body,
      region: 'cn-beijing',
      service: 'ark',
      extraHeaders: { 'x-content-sha256': payloadHash },
      now: NOW,
    })

    expect(result.signedHeaders).toBe('host;x-content-sha256;x-date')
    expect(result.headers['x-content-sha256']).toBe(payloadHash)
    expect(result.authorization).toContain('SignedHeaders=host;x-content-sha256;x-date')
  })

  it('sorts query parameters by name', async () => {
    const base: VolcSignInput = {
      accessKey: AK,
      secretKey: SK,
      method: 'GET',
      host: 'example.volcengineapi.com',
      region: 'cn-beijing',
      service: 'example',
      now: NOW,
    }
    const ordered = await signVolcRequest({
      ...base,
      query: { Version: '2024-01-01', Action: 'ListThings', Limit: '10' },
    })
    // Same parameters in a different insertion order must produce the identical signature.
    const shuffled = await signVolcRequest({
      ...base,
      query: { Limit: '10', Action: 'ListThings', Version: '2024-01-01' },
    })

    expect(ordered.authorization).toBe(shuffled.authorization)
  })
})
