/**
 * 火山方舟 Agent Plan → 统一展示模型（issue #20）。
 *
 * 这个适配器比其他平台多接一路输入：**推理用量来自另一个接口切片**
 * （`/api/volc/inference-usage`，与 Agent Plan 用同一对 AK/SK），
 * 因此由 `VolcPlanSection` 按 keyHint 配对后传进来。
 */
import type {
  AccountDetail,
  AccountIdentity,
  DataTable,
  InferenceRow,
  InferenceUsageResponse,
  Metric,
  VolcPlanData,
  WindowQuota,
} from '../types'
import { isFailedAccount } from '../types'
import {
  countMetric,
  field,
  identityFields,
  notice,
  table,
  tokenMetric,
  windowQuota,
} from '../detail'
import { formatCount, formatTokens } from '../format'
import { PLAN_WINDOW_LABELS, formatDateTime, ratioOf } from '../utils'

type VolcAccount = VolcPlanData & AccountIdentity

/** 推理用量表的名字（Section 用它决定要不要挂模型过滤控件，避免按下标猜）。 */
export const INFERENCE_TABLE_TITLE = '推理用量'

/** 表名带区间（`推理用量（2026-09-01 ~ 2026-09-17）`），因此按前缀判定。 */
export function isInferenceTable(title: string): boolean {
  return title.startsWith(INFERENCE_TABLE_TITLE)
}

interface InferenceTotals {
  input: number
  output: number
  total: number
  requests: number
}

/**
 * 推理用量视图：**字段恒存在**的扁平对象。
 *
 * 弹窗里要同时处理「整个切片挂了」「该账号不在响应里」「该账号查询失败」三种缺数据情形。
 * 若建模成判别联合（`{state:'ok'} | {state:'failed'}`），模板每次取字段都得先收窄，
 * 而 vue-tsc **不支持对 `map.get(...)` 这类调用表达式收窄**（v-if 能过、build 过不去）。
 */
export interface InferenceView {
  ok: boolean
  start: string
  end: string
  totals: InferenceTotals
  rows: InferenceRow[]
  /** 失败时的提示样式与文案（`ok` 为 true 时不使用）。 */
  theme: 'error' | 'warning'
  message: string
}

const EMPTY_TOTALS: InferenceTotals = { input: 0, output: 0, total: 0, requests: 0 }

function failedInference(theme: 'error' | 'warning', message: string): InferenceView {
  return { ok: false, start: '', end: '', totals: EMPTY_TOTALS, rows: [], theme, message }
}

/** 推理用量切片 + 账号 keyHint → 视图。 */
export function buildInferenceView(
  inference: InferenceUsageResponse | null,
  inferenceError: string | null,
  keyHint: string,
): InferenceView {
  if (!inference) {
    return failedInference(
      inferenceError ? 'error' : 'warning',
      inferenceError ?? '推理用量暂不可用',
    )
  }
  const account = inference.accounts.find((entry) => entry.keyHint === keyHint)
  if (!account) {
    return failedInference('warning', '该账号未返回推理用量')
  }
  if (isFailedAccount(account)) {
    return failedInference('error', account.error)
  }
  const rows = account.rows ?? []
  return {
    ok: true,
    start: account.start,
    end: account.end,
    totals: rows.reduce(
      (acc, row) => ({
        input: acc.input + row.inputTokens,
        output: acc.output + row.outputTokens,
        total: acc.total + row.totalTokens,
        requests: acc.requests + row.requests,
      }),
      EMPTY_TOTALS,
    ),
    rows: rows.toSorted((a, b) => (a.day < b.day ? 1 : -1)),
    theme: 'warning',
    message: '',
  }
}

function codingWindowLabel(level: string): string {
  const normalized = level.toLowerCase()
  if (
    normalized.startsWith('session') ||
    normalized.startsWith('5h') ||
    normalized.startsWith('five')
  ) {
    return '5 小时窗口'
  }
  if (normalized.startsWith('week')) {
    return '每周窗口'
  }
  if (normalized.startsWith('month')) {
    return '每月窗口'
  }
  return level || '—'
}

/**
 * Agent Plan 窗口：上游给 `quota`（总量）与 `used`，百分比自己算。
 * 比值只在这里算一次，卡面与弹窗里的进度条读同一个 `percent`。
 * `remaining` 显式钳到 0 —— 超额使用时「剩余 -1.2K」是负数噪声。
 *
 * **单位是 AFP**（文档 82379/2366394）：不写单位的话，`0 / 50.0K` 会被读成 token 或次数。
 *
 * `daily` 单独加脚注：它是**模型日额度**，只有图片生成 / 视频生成 / 语音模型与 Harness
 * 计入，文本与向量化模型不受它约束。不加这句，只跑文本时「已用 0」看起来就像数据坏了。
 */
function agentWindows(account: VolcAccount): WindowQuota[] {
  return account.windows.map((window) =>
    windowQuota({
      key: window.window,
      label: PLAN_WINDOW_LABELS[window.window] ?? window.window,
      percent: ratioOf(window.used, window.quota),
      used: window.used,
      total: window.quota,
      remaining: Math.max(0, window.quota - window.used),
      resetAt: window.resetTime,
      unit: 'AFP',
      ...(window.window === 'daily' ? { note: DAILY_WINDOW_NOTE } : {}),
    }),
  )
}

/** 与 `server/volc.ts` 的 `AFPDaily` 说明同源（上游口径见文档 82379/2366394）。 */
const DAILY_WINDOW_NOTE = '仅图片生成 / 视频生成 / 语音模型与 Harness 计入'

/** ISO 时刻（`2026-10-06T15:59:59Z`）→ 本地可读；解析不出来就原样回退，不吞信息。 */
function isoText(value: string): string {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? value : formatDateTime(ms)
}

/**
 * Coding Plan 窗口：`cardFace: false` —— 它与 Agent Plan 共用一对 AK/SK 但归属另一个订阅，
 * 放到卡面上会出现两个「5 小时窗口」（标签还得被迫加前缀）。标签仍带前缀，
 * 因为弹窗里两块窗口并排出现时需要能分辨。
 */
function codingWindows(account: VolcAccount): WindowQuota[] {
  return account.codingPlan.windows.map((window) =>
    windowQuota({
      key: `coding-${window.level}`,
      label: `Coding Plan · ${codingWindowLabel(window.level)}`,
      percent: window.percent,
      resetAt: window.resetTime,
      cardFace: false,
    }),
  )
}

function totalUsage(account: VolcAccount): string {
  const total = account.details.reduce((sum, entry) => sum + entry.usage, 0)
  return `${formatTokens(total)} ${account.details[0]?.unit ?? 'Tokens'}`
}

function detailsTable(account: VolcAccount): DataTable {
  return table(
    '模型调用明细',
    [
      { key: 'time', label: '时间' },
      { key: 'objectName', label: '模型' },
      { key: 'usage', label: '用量', align: 'right' },
      { key: 'billingType', label: '计费类型', kind: 'status' },
    ],
    account.details.map((entry) => ({
      _key: `${entry.time}-${entry.objectName}`,
      time: formatDateTime(entry.time),
      objectName: entry.objectName,
      usage: formatTokens(entry.usage),
      billingType: entry.billingType === 'WithinPlan' ? '套餐内' : '套餐外',
    })),
  )
}

function inferenceTable(inference: InferenceView): DataTable {
  const summary: Metric[] = [
    tokenMetric('inference-total', '总 Token', inference.totals.total),
    tokenMetric('inference-input', '输入', inference.totals.input),
    tokenMetric('inference-output', '输出', inference.totals.output),
    countMetric('inference-requests', '请求数', inference.totals.requests),
  ]
  return table(
    `${INFERENCE_TABLE_TITLE}（${inference.start} ~ ${inference.end}）`,
    [
      { key: 'day', label: '日期' },
      { key: 'inputTokens', label: '输入 Tokens', align: 'right' },
      { key: 'outputTokens', label: '输出 Tokens', align: 'right' },
      { key: 'totalTokens', label: '总 Tokens', align: 'right' },
      { key: 'requests', label: '请求数', align: 'right' },
    ],
    inference.rows.map((row) => ({
      _key: row.day,
      day: row.day,
      inputTokens: formatTokens(row.inputTokens),
      outputTokens: formatTokens(row.outputTokens),
      totalTokens: formatTokens(row.totalTokens),
      requests: formatCount(row.requests),
    })),
    { summary },
  )
}

export function toVolcPlanDetail(account: VolcAccount, inference: InferenceView): AccountDetail {
  const plan = account.personalPlan
  return {
    identity: identityFields(account, 'VOLC_LABEL / VOLC_LABEL_N'),
    windows: [...agentWindows(account), ...codingWindows(account)],
    balances: [],
    metrics: [],
    tables: [detailsTable(account), ...(inference.ok ? [inferenceTable(inference)] : [])],
    meta: [
      field('套餐类型', account.planType ?? '未知'),
      // 以下四项来自 GetPersonalPlan；未订阅/已回收时它整块为 null，字段自然落成 —
      field('套餐状态', plan?.status ?? null),
      field('生效时间', plan ? isoText(plan.startTime) : null),
      field('到期时间', plan ? isoText(plan.endTime) : null),
      field('自动续费', plan ? (plan.autoRenew ? '已开启' : '未开启') : null),
      field('明细区间', `${account.detailsStart} ~ ${account.detailsEnd}`),
      field('Coding Plan 状态', account.codingPlan.status || null),
      field('调用明细合计', totalUsage(account)),
    ],
    links: [],
    notices: inference.ok
      ? []
      : [
          notice(
            inference.theme === 'error' ? 'error' : 'warn',
            `推理用量不可用：${inference.message}`,
          ),
        ],
  }
}
