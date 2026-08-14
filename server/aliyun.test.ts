import { describe, expect, it } from 'vite-plus/test'

import { aliyunEncode, aliyunStringToSign, signAliyunRpc } from './aliyun.ts'

// 阿里云官方文档（RPC 签名机制）的经典示例参数。
const DOC_PARAMS: Record<string, string> = {
  AccessKeyId: 'testid',
  Action: 'DescribeRegions',
  Format: 'XML',
  SignatureMethod: 'HMAC-SHA1',
  SignatureNonce: '3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf',
  SignatureVersion: '1.0',
  Timestamp: '2016-02-23T12:46:24Z',
  Version: '2014-05-26',
}

describe('aliyunStringToSign', () => {
  it('reproduces the documented canonical string exactly', async () => {
    expect(aliyunStringToSign(DOC_PARAMS)).toBe(
      'POST&%2F&AccessKeyId%3Dtestid%26Action%3DDescribeRegions%26Format%3DXML%26SignatureMethod%3DHMAC-SHA1%26SignatureNonce%3D3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf%26SignatureVersion%3D1.0%26Timestamp%3D2016-02-23T12%253A46%253A24Z%26Version%3D2014-05-26',
    )
  })
})

describe('signAliyunRpc', () => {
  it('produces a deterministic base64 HMAC-SHA1 signature', async () => {
    const first = await signAliyunRpc(DOC_PARAMS, 'testsecret')
    const second = await signAliyunRpc(DOC_PARAMS, 'testsecret')

    expect(first).toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9+/]{27}=$/)
    expect(first).not.toBe(await signAliyunRpc(DOC_PARAMS, 'wrong-secret'))
  })

  it('sorts parameters by name before signing', async () => {
    const a = await signAliyunRpc(
      { Action: 'QueryResourcePackageInstances', Version: '2017-12-14', PageSize: '100' },
      'secret',
    )
    const b = await signAliyunRpc(
      { Version: '2017-12-14', PageSize: '100', Action: 'QueryResourcePackageInstances' },
      'secret',
    )

    expect(a).toBe(b)
  })
})

describe('aliyunEncode', () => {
  it('RFC3986-encodes reserved characters with uppercase hex', async () => {
    expect(aliyunEncode("a b+c/d'e()*~")).toBe('a%20b%2Bc%2Fd%27e%28%29%2A~')
  })
})
