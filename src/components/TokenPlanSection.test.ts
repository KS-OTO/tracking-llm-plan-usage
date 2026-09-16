import { describe, expect, it } from 'vite-plus/test'
import { mountWithTDesign, openDetail } from '../test-utils/mount'

import TokenPlanSection from './TokenPlanSection.vue'
import type {
  TokenPlanData,
  TokenPlanPersonalPlan,
  TokenPlanPersonalSlice,
  TokenPlanResponse,
} from '../types'

type TokenPlanAccountFixture = TokenPlanData & { keyHint: string; label?: string }

/** 个人版用量的默认底座：各用例只覆盖关心的字段。 */
const defaultPlan: TokenPlanPersonalPlan = {
  source: 'cookie',
  fiveHour: null,
  weekly: { percent: 0, resetTime: 0 },
  subscription: null,
  addon: null,
  resetCards: [],
}

/** 成功账号（组织/座席/共享包 + 个人版用量），作为各用例的公共底座。 */
const successAccount: TokenPlanAccountFixture = {
  keyHint: 'LTAI****wxyz',
  label: '团队主号',
  account: {
    accountType: 'ALIYUN',
    name: '主账号',
    accountId: '123456',
    aliyunUid: '123456',
    orgs: [],
  },
  seats: {
    total: 1,
    items: [
      {
        seatId: 'seat-1',
        instanceCode: 'inst-001',
        specType: '专业版',
        status: 'NORMAL',
        assignedStatus: 'ASSIGNED',
        startTime: 1_760_000_000,
        endTime: 1_766_000_000,
        equityList: [
          {
            equityType: 'CREDITS',
            cycleStartTime: 1_760_000_000,
            cycleEndTime: 1_766_000_000,
            cycleTotalValue: 1_000_000,
            cycleSurplusValue: 300_000,
          },
        ],
      },
    ],
  },
  sharedPackages: {
    total: 0,
    items: [],
  },
  personal: {
    data: {
      source: 'cookie',
      fiveHour: { percent: 42.5, resetTime: Date.now() + 3_600_000 },
      weekly: { percent: 12, resetTime: Date.now() + 6 * 86_400_000 },
      subscription: {
        instanceCode: 'sfm_tokenplansolo_public_cn-gz84w63sy2k',
        specCode: 'token_plan_personal_pro',
        status: 'NORMAL',
        remainingDays: 25,
        startTime: Date.now() - 5 * 86_400_000,
        endTime: Date.now() + 25 * 86_400_000,
        autoRenewFlag: true,
      },
      addon: { remainingCredits: 320_000, totalCredits: 625_000, activeCount: 1 },
      resetCards: [],
    },
  },
}

/** 单账号 fixture，仅替换个人版用量切片。 */
function personalFixture(personal: TokenPlanPersonalSlice): TokenPlanResponse {
  return { accounts: [{ ...successAccount, personal }] }
}

/** 个人版用量成功切片（字段与底座合并）。 */
function personalData(plan: Partial<TokenPlanPersonalPlan>): TokenPlanResponse {
  return personalFixture({ data: { ...defaultPlan, ...plan } })
}

const fixture: TokenPlanResponse = {
  accounts: [successAccount, { keyHint: 'LTAI****failed', error: 'NotAuthorized' }],
}

describe('TokenPlanSection', () => {
  it('keeps only the personal plan windows on the card', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('个人版套餐用量')
    expect(text).toContain('5 小时窗口')
    expect(text).toContain('7 天窗口')
    expect(text).toContain('42.5%')
    // 账号身份、订阅元数据、座席表、共享包表都属低优先级信息，已移出卡片
    expect(text).not.toContain('UID 123456')
    expect(text).not.toContain('订阅座席')
    expect(text).not.toContain('inst-001')
    expect(text).not.toContain('剩余天数')
    expect(text).not.toContain('320.0K')
  })

  it('prefers the alias over the key hint', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const account = wrapper.find('.account-group')
    expect(account.find('.account-name').text()).toBe('团队主号')
    expect(account.find('.key-hint').text()).toBe('LTAI****wxyz')
  })

  it('moves account identity into the detail dialog', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('团队主号')
    expect(detail).toContain('ALIYUN')
    expect(detail).toContain('主账号')
    expect(detail).toContain('UID')
    expect(detail).toContain('123456')
  })

  it('moves subscription and addon metadata into the detail dialog', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('token_plan_personal_pro')
    expect(detail).toContain('sfm_tokenplansolo_public_cn-gz84w63sy2k')
    expect(detail).toContain('剩余天数')
    expect(detail).toContain('25 天')
    expect(detail).toContain('自动续费')
    expect(detail).toContain('已开启')
    expect(detail).toContain('加购包剩余')
    expect(detail).toContain('320.0K')
  })

  it('moves seat equity and shared packages into the detail dialog', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const detail = await openDetail(wrapper)
    expect(detail).toContain('订阅座席（1）')
    expect(detail).toContain('inst-001')
    expect(detail).toContain('专业版')
    expect(detail).toContain('1.00M')
    expect(detail).toContain('300.0K')
    expect(detail).toContain('没有共享包')
  })

  it('shows an alert for the failed account', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: fixture, loading: false, error: null },
    })
    const alerts = wrapper.findAllComponents({ name: 'TAlert' })
    expect(alerts.map((alert) => alert.text())).toEqual([expect.stringContaining('LTAI****failed')])
  })

  it('renders neutral empty state (no red alert) when notConfigured', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: null, loading: false, error: null, notConfigured: true },
    })
    expect(wrapper.text()).toContain('ALIYUN_TOKENPLAN_COOKIE')
    expect(wrapper.findComponent({ name: 'TAlert' }).exists()).toBe(false)
  })

  it('shows skeleton when loading without data', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: null, loading: true, error: null },
    })
    expect(wrapper.findComponent({ name: 'TSkeleton' }).exists()).toBe(true)
  })

  it('labels the personal usage data source inside the dialog', async () => {
    const fromCookie = mountWithTDesign(TokenPlanSection, {
      props: { data: personalData({ source: 'cookie' }), loading: false, error: null },
    })
    expect(await openDetail(fromCookie)).toContain('会话 Cookie')

    const fromCli = mountWithTDesign(TokenPlanSection, {
      props: { data: personalData({ source: 'cli' }), loading: false, error: null },
    })
    expect(await openDetail(fromCli)).toContain('AK/SK')
  })

  it('renders reset cards with their nearest expiry inside the dialog', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: {
        data: personalData({
          resetCards: [
            { cardType: 'RESET_1W', effectiveAt: 1_789_056_000_000, expiresAt: 1_789_920_000_000 },
          ],
        }),
        loading: false,
        error: null,
      },
    })
    expect(wrapper.text()).not.toContain('重置卡')
    const detail = await openDetail(wrapper)
    expect(detail).toContain('重置卡')
    expect(detail).toContain('1 张')
  })

  it('omits the reset-card row when there are no cards', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: personalData({}), loading: false, error: null },
    })
    expect(wrapper.text()).not.toContain('重置卡')
    expect(await openDetail(wrapper)).not.toContain('重置卡')
  })

  it('hides the 5-hour row when the official window is absent', () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: {
        data: personalData({ fiveHour: null, weekly: { percent: 0, resetTime: 0 } }),
        loading: false,
        error: null,
      },
    })
    const text = wrapper.text()
    expect(text).not.toContain('5 小时窗口')
    expect(text).toContain('7 天窗口')
  })

  it('skips the addon block when the summary is all zeros', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: {
        data: personalData({ addon: { remainingCredits: 0, totalCredits: 0, activeCount: 0 } }),
        loading: false,
        error: null,
      },
    })
    expect(wrapper.text()).not.toContain('加购包剩余')
    expect(await openDetail(wrapper)).not.toContain('加购包剩余')
  })

  it('degrades personal failure to a warning without hiding org/seat data', async () => {
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: {
        data: personalFixture({
          error: 'RAM 权限不足：需要 modelstudio:GenerateCLIAccessToken',
        }),
        loading: false,
        error: null,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('个人版用量查询失败')
    expect(text).toContain('modelstudio:GenerateCLIAccessToken')
    // 组织/座席视图不受影响（弹窗内）
    const detail = await openDetail(wrapper)
    expect(detail).toContain('订阅座席（1）')
    expect(detail).toContain('inst-001')
  })

  it('renders a cookie-only account and hides the org/seat sections', async () => {
    const cookieOnly: TokenPlanResponse = {
      accounts: [
        {
          keyHint: 'cookie:9a3f****c81b',
          label: '个人版主号',
          account: null,
          seats: null,
          sharedPackages: null,
          personal: {
            data: {
              ...defaultPlan,
              weekly: { percent: 27.5, resetTime: 1_789_957_380_000 },
            },
          },
        },
      ],
    }
    const wrapper = mountWithTDesign(TokenPlanSection, {
      props: { data: cookieOnly, loading: false, error: null },
    })
    const text = wrapper.text()
    expect(text).toContain('个人版主号')
    expect(text).toContain('cookie:9a3f****c81b')
    expect(text).toContain('7 天窗口')
    expect(text).toContain('27.5%')

    const detail = await openDetail(wrapper)
    expect(detail).toContain('仅配置会话 Cookie')
    // 无 AK/SK ⇒ 组织/座席/共享包整块不渲染
    expect(detail).not.toContain('订阅座席')
    expect(detail).not.toContain('没有共享包')
  })
})
