import { describe, expect, it } from 'vite-plus/test'

import {
  buildGatewayParams,
  buildGatewayRequest,
  normalizeSessionCookie,
  parseAccessTokenResponse,
  parsePersonalAddon,
  parsePersonalSubscription,
  parsePersonalUsage,
  parseResetCards,
  parseGatewayResponse,
  sessionExpiredHint,
  signAcs3,
  unwrapConsolePayload,
} from './aliyun-console.ts'

// 签名实现已对 modelstudio.cn-beijing.aliyuncs.com 真实网关验证：
// 返回 403 NoPermission + AccessDeniedDetail.AuthAction=modelstudio:GenerateCLIAccessToken
// （而非 SignatureDoesNotMatch），证明签名通过、仅 RAM 授权不足。
const SIGN_INPUT = {
  accessKeyId: 'AKIDEXAMPLE',
  accessKeySecret: 'SECRETEXAMPLE',
  action: 'GenerateCLIAccessToken',
  version: '2026-02-10',
  host: 'modelstudio.cn-beijing.aliyuncs.com',
  pathname: '/modelstudio/cli/generateAccessToken',
  method: 'POST',
  body: '',
  date: '2026-09-14T06:00:00Z',
  nonce: '4f1a0d2c-1e0b-4a5f-9c3d-2b6e7a8f0c11',
}

describe('signAcs3', () => {
  it('matches the reference implementation vector (independent Node crypto cross-check)', async () => {
    const headers = await signAcs3(SIGN_INPUT)

    expect(headers['x-acs-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(headers.authorization).toBe(
      'ACS3-HMAC-SHA256 Credential=AKIDEXAMPLE,' +
        'SignedHeaders=content-type;host;x-acs-action;x-acs-content-sha256;x-acs-date;' +
        'x-acs-signature-nonce;x-acs-version,' +
        'Signature=ceb15ef6212bb1e921ab836d5aa9e2e109f9f68708300a4110a073a1760ecdc8',
    )
  })

  it('is deterministic for identical inputs', async () => {
    expect(await signAcs3(SIGN_INPUT)).toEqual(await signAcs3(SIGN_INPUT))
  })

  it('signs host and content-type alongside x-acs headers, sorted', async () => {
    const headers = await signAcs3(SIGN_INPUT)

    expect(headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version',
    )
    expect(headers.host).toBe('modelstudio.cn-beijing.aliyuncs.com')
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-acs-action']).toBe('GenerateCLIAccessToken')
    expect(headers['x-acs-version']).toBe('2026-02-10')
  })

  it('changes when the date, body or secret changes', async () => {
    const base = await signAcs3(SIGN_INPUT)

    expect(
      (await signAcs3({ ...SIGN_INPUT, date: '2026-09-14T06:00:01Z' })).authorization,
    ).not.toBe(base.authorization)
    expect((await signAcs3({ ...SIGN_INPUT, body: '{}' })).authorization).not.toBe(
      base.authorization,
    )
    expect((await signAcs3({ ...SIGN_INPUT, accessKeySecret: 'other' })).authorization).not.toBe(
      base.authorization,
    )
  })

  it('includes the STS security token in headers and signature when provided', async () => {
    const withToken = await signAcs3({ ...SIGN_INPUT, securityToken: 'sts-token' })
    const without = await signAcs3(SIGN_INPUT)

    expect(withToken['x-acs-security-token']).toBe('sts-token')
    expect(withToken.authorization).toContain('x-acs-security-token')
    expect(withToken.authorization).not.toBe(without.authorization)
  })
})

describe('buildGatewayParams', () => {
  it('wraps the api call with the console cornerstoneParam contract', () => {
    const params = JSON.parse(
      buildGatewayParams('zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage'),
    )

    expect(params).toEqual({
      Api: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage',
      V: '1.0',
      Data: {
        cornerstoneParam: {
          protocol: 'V2',
          console: 'ONE_CONSOLE',
          productCode: 'p_efm',
          switchUserType: 3,
          consoleSite: 'BAILIAN_ALIYUN',
        },
      },
    })
  })

  it('merges call-specific data alongside cornerstoneParam', () => {
    const params = JSON.parse(buildGatewayParams('some.api', { OrgId: 'org_1' }))

    expect(params.Data.OrgId).toBe('org_1')
    expect(params.Data.cornerstoneParam.productCode).toBe('p_efm')
  })
})

describe('normalizeSessionCookie', () => {
  // 真实教训：把裸 ticket 值直接当 cookie 头发出去时，请求里没有 `name=`，
  // 网关一律判为未登录 —— 故必须补上名字。
  it('adds the login_aliyunid_ticket name to a bare ticket value', () => {
    expect(normalizeSessionCookie('ticket_value_without_equals')).toBe(
      'login_aliyunid_ticket=ticket_value_without_equals',
    )
  })

  it('keeps a full cookie header untouched', () => {
    const header =
      'login_aliyunid_ticket=ticket_value; login_aliyunid_csrf=_csrf_tk_1937689353806387'
    expect(normalizeSessionCookie(header)).toBe(header)
  })

  it('keeps a single name=value pair untouched', () => {
    expect(normalizeSessionCookie('login_aliyunid_ticket=abc')).toBe('login_aliyunid_ticket=abc')
  })

  it('trims surrounding whitespace and tolerates empty input', () => {
    expect(normalizeSessionCookie('  abc  ')).toBe('login_aliyunid_ticket=abc')
    expect(normalizeSessionCookie('   ')).toBe('')
    expect(normalizeSessionCookie('')).toBe('')
  })
})

describe('sessionExpiredHint', () => {
  // 真实验证：ticket 值含字面 `$`，本地 .env 未转义时会被 $VAR 展开吃掉 23 个字符
  // （153 → 130），而网关给出的报错与「会话真过期」完全一致。补长度让用户自证。
  it('reports the length of the configured value so truncation is self-evident', () => {
    const cookie = 'login_aliyunid_ticket=abcde'
    const hint = sessionExpiredHint(cookie)

    expect(hint).toContain(String(cookie.length))
    expect(hint).toContain('.env')
  })

  it('mentions the dollar-escaping remedy', () => {
    expect(sessionExpiredHint('x')).toContain('\\$')
  })

  it('keeps the hint free of the value itself', () => {
    // 只披露长度，不泄露内容
    expect(sessionExpiredHint('login_aliyunid_ticket=supersecret')).not.toContain('supersecret')
  })
})

describe('buildGatewayRequest', () => {
  const usageApi = 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage'

  it('targets the console data gateway with the browser-identical query string', () => {
    const request = buildGatewayRequest('/data/api.json', usageApi)

    expect(request.url).toBe(
      'https://bailian-cs.console.aliyun.com/data/api.json?' +
        'action=BroadScopeAspnGateway&product=sfm_bailian&' +
        `api=${encodeURIComponent(usageApi)}&_v=`,
    )
  })

  it('posts a urlencoded params + region body (matching the captured request)', () => {
    const request = buildGatewayRequest('/data/api.json', usageApi)
    const body = new URLSearchParams(request.body)

    expect(body.get('region')).toBe('cn-beijing')
    expect(JSON.parse(body.get('params') ?? '{}')).toEqual({
      Api: usageApi,
      V: '1.0',
      Data: {
        cornerstoneParam: {
          protocol: 'V2',
          console: 'ONE_CONSOLE',
          productCode: 'p_efm',
          switchUserType: 3,
          consoleSite: 'BAILIAN_ALIYUN',
        },
      },
    })
  })

  it('sends the session cookie for the /data channel and a bearer for the /cli channel', () => {
    const session = buildGatewayRequest('/data/api.json', usageApi, {}, { cookie: 'a=b' })
    const cli = buildGatewayRequest(
      '/cli/api.json',
      usageApi,
      {},
      {
        authorization: 'Bearer tok',
      },
    )

    expect(session.headers.cookie).toBe('a=b')
    expect(session.headers.authorization).toBeUndefined()
    expect(cli.headers.authorization).toBe('Bearer tok')
    expect(cli.headers.cookie).toBeUndefined()
    expect(cli.headers['content-type']).toBe('application/x-www-form-urlencoded')
  })
})

describe('unwrapConsolePayload', () => {
  it('unwraps the three-level data.DataV2.data.data envelope', () => {
    const payload = unwrapConsolePayload({
      data: { DataV2: { data: { data: { per1WeekPercentage: 0.12 } } } },
    })

    expect(payload).toEqual({ per1WeekPercentage: 0.12 })
  })

  it('unwraps the real captured usage envelope down to the counters', () => {
    // 2026-09-14 真实抓包（结构原样保留，仅替换时间戳）
    const payload = unwrapConsolePayload({
      code: '200',
      data: {
        DataV2: {
          ret: ['SUCCESS::接口调用成功'],
          data: {
            msg: 'Success.',
            code: 'SUCCESS',
            data: { per1WeekResetTime: 1789957380000, per1WeekPercentage: 0.2750906925 },
            requestId: 'b7d15d79-f23b-4639-8654-b495dd80e520',
            success: true,
          },
        },
        success: true,
        httpStatus: 200,
        errorCode: '',
        api: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage',
        errorMsg: '',
      },
      httpStatusCode: '200',
      requestId: 'b7d15d79-f23b-4639-8654-b495dd80e520',
      successResponse: true,
    })

    expect(payload).toEqual({
      per1WeekResetTime: 1789957380000,
      per1WeekPercentage: 0.2750906925,
    })
  })

  it('returns the array payload used by reset-card/list', () => {
    const payload = unwrapConsolePayload({
      data: {
        DataV2: {
          data: {
            msg: 'Success.',
            code: 'SUCCESS',
            data: [{ cardType: 'RESET_1W' }],
            success: true,
          },
        },
      },
    })

    expect(payload).toEqual([{ cardType: 'RESET_1W' }])
  })

  it('falls back to data.DataV2.data when the innermost layer is absent', () => {
    expect(unwrapConsolePayload({ data: { DataV2: { data: { a: 1 } } } })).toEqual({ a: 1 })
  })

  it('falls back to the shallow data.data shape', () => {
    expect(unwrapConsolePayload({ data: { data: { b: 2 } } })).toEqual({ b: 2 })
  })

  it('passes through when no data layer exists', () => {
    expect(unwrapConsolePayload({ raw: true })).toEqual({ raw: true })
    expect(unwrapConsolePayload(null)).toBeNull()
  })
})

describe('parsePersonalUsage', () => {
  // 关键语义：接口返回的是 0-1 比值，需 ×100 才是百分比
  // （真实抓包 0.2750906925 对应控制台 27.51%）
  it('scales the 0-1 ratios into percentages', () => {
    const result = parsePersonalUsage({
      per5HourPercentage: 0.25,
      per5HourResetTime: 1_789_371_600_000,
      per1WeekPercentage: 0.5,
      per1WeekResetTime: 1_789_975_200_000,
    })

    expect(result.fiveHour).toEqual({ percent: 25, resetTime: 1_789_371_600_000 })
    expect(result.weekly).toEqual({ percent: 50, resetTime: 1_789_975_200_000 })
  })

  it('maps the real captured weekly ratio to 27.50906925%', () => {
    const result = parsePersonalUsage({
      per1WeekResetTime: 1789957380000,
      per1WeekPercentage: 0.2750906925,
    })

    expect(result.weekly.percent).toBeCloseTo(27.50906925, 8)
    expect(result.weekly.resetTime).toBe(1789957380000)
    expect(result.fiveHour).toBeNull()
  })

  it('drops the 5-hour window when both of its fields are missing', () => {
    const result = parsePersonalUsage({ per1WeekPercentage: 0.05, per1WeekResetTime: 1 })

    expect(result.fiveHour).toBeNull()
    expect(result.weekly.percent).toBeCloseTo(5, 8)
  })

  it('keeps the 5-hour window when only one field is present', () => {
    const result = parsePersonalUsage({ per5HourPercentage: 0.88 })

    expect(result.fiveHour).toEqual({ percent: 88, resetTime: 0 })
  })

  it('defaults the weekly window to 0 instead of failing the refresh', () => {
    expect(parsePersonalUsage({}).weekly).toEqual({ percent: 0, resetTime: 0 })
  })

  it('clamps percentages to 0-100', () => {
    expect(parsePersonalUsage({ per1WeekPercentage: 1.8 }).weekly.percent).toBe(100)
    expect(parsePersonalUsage({ per1WeekPercentage: -0.03 }).weekly.percent).toBe(0)
    expect(parsePersonalUsage({ per1WeekPercentage: 'x' }).weekly.percent).toBe(0)
  })

  it('accepts numeric strings returned as ratios', () => {
    expect(parsePersonalUsage({ per1WeekPercentage: '0.42' }).weekly.percent).toBeCloseTo(42, 8)
  })
})

describe('parsePersonalSubscription', () => {
  const full = {
    instanceCode: 'sfm_tokenplansolo_public_cn-gz84w63sy2k',
    specCode: 'token_plan_personal_pro',
    status: 'NORMAL',
    remainingDays: 25,
    startTime: 1_789_000_000_000,
    endTime: 1_791_000_000_000,
    autoRenewFlag: true,
  }

  it('maps the subscription detail including the instance code', () => {
    expect(parsePersonalSubscription(full)).toEqual({
      instanceCode: 'sfm_tokenplansolo_public_cn-gz84w63sy2k',
      specCode: 'token_plan_personal_pro',
      status: 'NORMAL',
      remainingDays: 25,
      startTime: 1_789_000_000_000,
      endTime: 1_791_000_000_000,
      autoRenewFlag: true,
    })
  })

  it('maps the real captured subscription payload', () => {
    const result = parsePersonalSubscription({
      instanceCode: 'sfm_tokenplansolo_public_cn-gz84w63sy2k',
      specCode: 'pro',
      remainingDays: 46,
      startTime: 1785404529000,
      endTime: 1793376000000,
      autoRenewFlag: false,
      status: 'VALID',
    })

    expect(result).toEqual({
      instanceCode: 'sfm_tokenplansolo_public_cn-gz84w63sy2k',
      specCode: 'pro',
      status: 'VALID',
      remainingDays: 46,
      startTime: 1785404529000,
      endTime: 1793376000000,
      autoRenewFlag: false,
    })
  })

  it('returns null when specCode or status is missing', () => {
    expect(parsePersonalSubscription({ status: 'NORMAL' })).toBeNull()
    expect(parsePersonalSubscription({ specCode: 'x' })).toBeNull()
    expect(parsePersonalSubscription({ specCode: '', status: 'NORMAL' })).toBeNull()
  })

  it('normalizes second-based timestamps and a missing autoRenewFlag', () => {
    const result = parsePersonalSubscription({
      ...full,
      startTime: 1_789_000_000,
      autoRenewFlag: undefined,
    })

    expect(result?.startTime).toBe(1_789_000_000_000)
    expect(result?.autoRenewFlag).toBe(false)
  })
})

describe('parsePersonalAddon', () => {
  it('maps credits and the active add-on count', () => {
    expect(
      parsePersonalAddon({ remainingCredits: 320_000, totalCredits: 625_000, activeCount: 2 }),
    ).toEqual({ remainingCredits: 320_000, totalCredits: 625_000, activeCount: 2 })
  })

  it('maps the real captured empty add-on summary', () => {
    expect(
      parsePersonalAddon({ remainingCredits: 0.0, activeCount: 0, totalCredits: 0.0 }),
    ).toEqual({ remainingCredits: 0, totalCredits: 0, activeCount: 0 })
  })

  it('defaults every field to 0 when the payload is empty', () => {
    expect(parsePersonalAddon({})).toEqual({
      remainingCredits: 0,
      totalCredits: 0,
      activeCount: 0,
    })
  })
})

describe('parseResetCards', () => {
  it('maps the real captured reset-card list', () => {
    expect(
      parseResetCards([
        {
          cardType: 'RESET_1W',
          effectiveAt: 1789056000000,
          cardNo: '982132cefe2c446785c0048b281a657f',
          expiresAt: 1789920000000,
        },
      ]),
    ).toEqual([{ cardType: 'RESET_1W', effectiveAt: 1789056000000, expiresAt: 1789920000000 }])
  })

  it('returns an empty list for non-array payloads (gateway degradation)', () => {
    expect(parseResetCards(null)).toEqual([])
    expect(parseResetCards({})).toEqual([])
    expect(parseResetCards('[]')).toEqual([])
  })

  it('skips entries without a cardType and normalizes second-based timestamps', () => {
    expect(
      parseResetCards([
        { expiresAt: 1_789_920_000_000 },
        { cardType: 'RESET_1W', effectiveAt: 1_789_056, expiresAt: 1_789_920_000_000 },
      ]),
    ).toEqual([{ cardType: 'RESET_1W', effectiveAt: 1_789_056_000, expiresAt: 1_789_920_000_000 }])
  })
})

describe('parseGatewayResponse', () => {
  // 2026-09-14 真实抓包：不带 Cookie 时网关返回 HTTP 200 + success:false
  const NOT_LOGINED = JSON.stringify({
    code: '200',
    data: {
      success: false,
      httpStatus: 200,
      errorCode: 'BailianGateway.Login.NotLogined',
      api: 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage',
      errorMsg: 'BailianGateway.Login.NotLogined',
    },
    httpStatusCode: '200',
    requestId: '5ec255c8-4d0d-47e9-bdd6-eb4382c26965',
    successResponse: true,
  })

  it('maps the captured NotLogined body to an actionable session-expired error', () => {
    expect(() => parseGatewayResponse(200, NOT_LOGINED)).toThrowError(
      expect.objectContaining({
        code: 'ConsoleSessionExpired',
        message:
          '请重新登录 bailian.console.aliyun.com，复制新的 login_aliyunid_ticket 到 ALIYUN_TOKENPLAN_COOKIE',
      }),
    )
  })

  it('passes through the payload of a successful envelope', () => {
    const ok = JSON.stringify({
      data: {
        DataV2: {
          data: {
            msg: 'Success.',
            code: 'SUCCESS',
            data: { per1WeekPercentage: 0.1 },
            success: true,
          },
        },
        success: true,
        errorCode: '',
      },
    })

    expect(parseGatewayResponse(200, ok)).toEqual({ per1WeekPercentage: 0.1 })
  })

  it('surfaces other gateway error codes verbatim', () => {
    const failed = JSON.stringify({
      data: { success: false, errorCode: 'SomeOther.Error', errorMsg: '数据库超时' },
    })

    expect(() => parseGatewayResponse(200, failed)).toThrowError(
      expect.objectContaining({ code: 'SomeOther.Error', message: '数据库超时' }),
    )
  })

  it('falls back to the error code when errorMsg is blank', () => {
    const failed = JSON.stringify({
      data: { success: false, errorCode: 'Gateway.Blank', errorMsg: '   ' },
    })

    expect(() => parseGatewayResponse(200, failed)).toThrowError(
      expect.objectContaining({ code: 'Gateway.Blank', message: 'Gateway.Blank' }),
    )
  })

  it('reports non-2xx responses with the HTTP status code', () => {
    expect(() => parseGatewayResponse(502, '<html>bad gateway</html>')).toThrowError(
      expect.objectContaining({ code: 'HTTP_502', message: expect.stringContaining('502') }),
    )
  })

  it('rejects a non-JSON 2xx body as InvalidResponse', () => {
    expect(() => parseGatewayResponse(200, '<html>login</html>')).toThrowError(
      expect.objectContaining({ code: 'InvalidResponse' }),
    )
  })

  it('treats a success envelope without DataV2 as an empty payload', () => {
    expect(parseGatewayResponse(200, JSON.stringify({ data: { success: true } }))).toEqual({
      success: true,
    })
  })
})

describe('parseAccessTokenResponse', () => {
  it('returns the token on success', async () => {
    await expect(
      parseAccessTokenResponse(200, JSON.stringify({ cliAccessToken: 'tok_123' })),
    ).resolves.toBe('tok_123')
  })

  it('turns the RAM ImplicitDeny into an actionable Chinese message', async () => {
    const body = JSON.stringify({
      Code: 'NoPermission',
      Message: 'You are not authorized to perform this action.',
      RequestId: 'req-1',
      AccessDeniedDetail: { AuthAction: 'modelstudio:GenerateCLIAccessToken' },
    })

    await expect(parseAccessTokenResponse(403, body)).rejects.toMatchObject({
      code: 'NoPermission',
      message:
        'RAM 权限不足：调用 GenerateCLIAccessToken 需要 modelstudio:GenerateCLIAccessToken。请在 RAM 策略中补充该 Action，或改用 ALIYUN_TOKENPLAN_COOKIE（控制台会话 Cookie，无需授权）。',
    })
  })

  it('falls back to the HTTP status code when no Code is present', async () => {
    await expect(parseAccessTokenResponse(500, JSON.stringify({}))).rejects.toMatchObject({
      code: 'HTTP_500',
      message: expect.stringContaining('HTTP_500：响应未提供错误详情'),
    })
  })

  it('surfaces a non-JSON body as InvalidResponse', async () => {
    await expect(parseAccessTokenResponse(200, '<html>bad gateway</html>')).rejects.toMatchObject({
      code: 'InvalidResponse',
      message: expect.stringContaining('响应不是合法 JSON'),
    })
  })

  it('rejects a 200 response without a token', async () => {
    await expect(
      parseAccessTokenResponse(200, JSON.stringify({ Message: 'ok' })),
    ).rejects.toMatchObject({ code: 'HTTP_200', message: 'ok' })
  })
})
