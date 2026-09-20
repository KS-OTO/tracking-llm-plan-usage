import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { getPersonalPlan, PLAN_NOT_FOUND_CODE, VolcApiError } from './volc.ts'

const credentials = { accessKey: 'AKLTEXAMPLEEXAMPLE0001', secretKey: 'example-secret-key' }

/**
 * 火山管控面统一响应信封：成功走 `Result`，失败走 `ResponseMetadata.Error`。
 * 这里只覆写 HTTP 状态与信封内容，签名本身由 `sign.ts` 的用例覆盖。
 */
function stubArkResponse(status: number, payload: unknown): void {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
}

function planResult(result: unknown): unknown {
  return { ResponseMetadata: { RequestId: 'test', Action: 'GetPersonalPlan' }, Result: result }
}

function planError(status: number, code: string, message: string): void {
  stubArkResponse(status, {
    ResponseMetadata: {
      RequestId: 'test',
      Action: 'GetPersonalPlan',
      Error: { Code: code, Message: message, Data: null },
    },
  })
}

describe('getPersonalPlan', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('把套餐档位、状态、生效与到期时间、自动续费解析出来', async () => {
    stubArkResponse(
      200,
      planResult({
        PlanType: 'Medium',
        Status: 'Running',
        StartTime: '2026-07-06T09:31:24Z',
        EndTime: '2026-10-06T15:59:59Z',
        AutoRenew: true,
      }),
    )
    expect(await getPersonalPlan(credentials, 'AgentPlan')).toStrictEqual({
      planType: 'Medium',
      status: 'Running',
      startTime: '2026-07-06T09:31:24Z',
      endTime: '2026-10-06T15:59:59Z',
      autoRenew: true,
    })
  })

  it('AutoRenew 为 false 时保持 false（不能被强制转换成 true）', async () => {
    stubArkResponse(200, planResult({ PlanType: 'Small', Status: 'Running', AutoRenew: false }))
    const plan = await getPersonalPlan(credentials, 'AgentPlan')
    expect(plan?.autoRenew).toBe(false)
  })

  it('未订阅/已回收（404 ResourceNotFound.Plan）收敛成 null，而不是抛错', async () => {
    planError(
      404,
      PLAN_NOT_FOUND_CODE,
      'The user does not have an active or existing personal plan.',
    )
    expect(await getPersonalPlan(credentials, 'CodingPlan')).toBeNull()
  })

  it('其它错误照常抛出（例如 Plan 取值非法）', async () => {
    planError(400, 'InvalidParameter.Plan', 'Plan must be AgentPlan or CodingPlan')
    await expect(getPersonalPlan(credentials, 'AgentPlan')).rejects.toBeInstanceOf(VolcApiError)
  })

  it('Result 结构漂移时降级成 null，不把整张卡打红', async () => {
    stubArkResponse(200, planResult({ Unexpected: 'shape' }))
    expect(await getPersonalPlan(credentials, 'AgentPlan')).toBeNull()
  })
})
