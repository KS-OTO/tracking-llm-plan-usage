<script setup lang="ts">
/**
 * 火山方舟 Agent Plan。
 *
 * 卡片只保留高优先级读数——Agent Plan 各窗口的额度进度；
 * 其余全部收进「详情」弹窗，共四段：
 *   1. 账号与套餐元信息（别名 / Key / 套餐类型 / 明细区间 / Coding Plan 状态 / 调用合计）
 *   2. Coding Plan 套餐额度（原先在卡片内，与 Agent Plan 并列反而互相干扰视线）
 *   3. 模型调用明细
 *   4. 推理用量（原「火山方舟 推理用量」独立区块，现并入此处，含模型过滤）
 *
 * 为什么把推理用量并进来：它和 Agent Plan / Coding Plan 用的是**同一对 AK/SK**、
 * 归属同一个火山方舟账号，单独占一张区块卡只会让「套餐订阅」Tab 多一个只放一行的卡片；
 * 而它本身就是明细级数据（按天 × 按模型的表格），与「详情」弹窗的定位一致。
 *
 * 推理用量走独立接口（`/api/volc/inference-usage`，支持 model 过滤），
 * 因此这里按 keyHint 与 Agent Plan 的账号配对后展示，两边账号天然一一对应。
 */
import { computed } from 'vue'

import type { InferenceRow, InferenceUsageResponse, VolcPlanResponse } from '../types'
import { accountTitle, isFailedAccount } from '../types'
import { formatCount, formatNumber, formatTokens, progressPercentage } from '../format'
import { formatDateTime, formatReset, PLAN_WINDOW_LABELS, progressStatus, ratioOf } from '../utils'

import AccountSection from './AccountSection.vue'
import DetailDialog from './DetailDialog.vue'

const props = defineProps<{
  data: VolcPlanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
  /** 推理用量（独立切片，可能整体失败）。 */
  inference: InferenceUsageResponse | null
  inferenceError: string | null
  /** 推理用量的模型过滤（受控，改动经 update:model 冒泡到 store）。 */
  model: string
}>()

const emit = defineEmits<{
  'update:model': [value: string]
}>()

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

const detailsColumns = [
  { colKey: 'time', title: '时间', width: 150, cell: 'time' },
  { colKey: 'objectName', title: '模型', width: 140, cell: 'objectName' },
  { colKey: 'usage', title: '用量', align: 'right' as const, cell: 'usage' },
  { colKey: 'billingType', title: '计费类型', width: 100, cell: 'billingType' },
]

const inferenceColumns = [
  { colKey: 'day', title: '日期', width: 110, cell: 'day' },
  { colKey: 'inputTokens', title: '输入 Tokens', align: 'right' as const, cell: 'inputTokens' },
  { colKey: 'outputTokens', title: '输出 Tokens', align: 'right' as const, cell: 'outputTokens' },
  { colKey: 'totalTokens', title: '总 Tokens', align: 'right' as const, cell: 'totalTokens' },
  { colKey: 'requests', title: '请求数', align: 'right' as const, cell: 'requests' },
]

type VolcAccount = NonNullable<VolcPlanResponse['accounts']>[number]

function detailRows(account: VolcAccount) {
  if (isFailedAccount(account)) {
    return []
  }
  return account.details
    .toSorted((a, b) => b.time - a.time)
    .map((entry, index) =>
      Object.assign({}, entry, { _key: `${entry.time}-${entry.objectName}-${index}` }),
    )
}

function totalOf(account: VolcAccount): string {
  if (isFailedAccount(account)) {
    return '—'
  }
  const total = account.details.reduce((sum, entry) => sum + entry.usage, 0)
  const unit = account.details[0]?.unit ?? 'Tokens'
  return `${formatTokens(total)} ${unit}`
}

interface InferenceTotals {
  input: number
  output: number
  total: number
  requests: number
}

/**
 * 推理用量的账号级视图。
 *
 * 弹窗里要同时处理「整个切片挂了」「该账号不在响应里」「该账号查询失败」三种缺数据情形。
 * 若建模成判别联合（`{state:'ok'} | {state:'failed'}`），模板每次取字段都得先收窄，
 * 而 vue-tsc **不支持对 `map.get(...)` 这类调用表达式收窄**（v-if 能过、build 过不去）。
 * 因此这里收成一个 **字段恒存在** 的扁平对象：`ok` 表示有没有数据，
 * 失败时其余字段取中性空值（模板只在 `ok` 分支使用它们），另附 failure 的 theme/message。
 */
interface InferenceView {
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
  return {
    ok: false,
    start: '',
    end: '',
    totals: EMPTY_TOTALS,
    rows: [],
    theme,
    message,
  }
}

function buildInferenceView(keyHint: string): InferenceView {
  if (!props.inference) {
    return failedInference(
      props.inferenceError ? 'error' : 'warning',
      props.inferenceError ?? '推理用量暂不可用',
    )
  }
  const account = props.inference.accounts.find((entry) => entry.keyHint === keyHint)
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
    rows: rows
      .toSorted((a, b) => (a.day < b.day ? 1 : -1))
      .map((row, index) => Object.assign({}, row, { _key: `${row.day}-${index}` })),
    theme: 'warning',
    message: '',
  }
}

/** 账号 keyHint → 推理用量视图（只随 props 变化重算，模板按账号取用）。 */
const inferenceByAccount = computed<Map<string, InferenceView>>(() => {
  const map = new Map<string, InferenceView>()
  for (const account of props.data?.accounts ?? []) {
    map.set(account.keyHint, buildInferenceView(account.keyHint))
  }
  return map
})

/** 取某账号的推理用量视图；未在 Agent Plan 账号列表里的调用方拿到中性失败视图。 */
function inferenceOf(keyHint: string): InferenceView {
  return inferenceByAccount.value.get(keyHint) ?? failedInference('warning', '推理用量暂不可用')
}
</script>

<template>
  <AccountSection
    title="火山方舟 Agent Plan"
    :subtitle="`账号 ${data?.accounts.length ?? 0}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="data?.accounts.length === 0"
    empty-text="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
  >
    <template v-if="data">
      <div class="grid-cards grid-cards--wide">
        <div v-for="account in data.accounts" :key="account.keyHint" class="account-group">
          <div class="account-head">
            <span v-if="account.label" class="account-name">{{ account.label }}</span>
            <span class="key-hint" :class="{ 'key-hint-secondary': account.label }">
              {{ account.keyHint }}
            </span>
            <DetailDialog
              v-if="!isFailedAccount(account)"
              :title="accountTitle(account)"
              :subtitle="account.label ? account.keyHint : undefined"
            >
              <t-descriptions :column="2" size="small" class="detail-block">
                <t-descriptions-item label="别名">
                  {{ account.label || '未配置（用 VOLC_LABEL / VOLC_LABEL_N 设置）' }}
                </t-descriptions-item>
                <t-descriptions-item label="Key">
                  <span class="num">{{ account.keyHint }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="套餐类型">
                  {{ account.planType ?? '未知' }}
                </t-descriptions-item>
                <t-descriptions-item label="明细区间">
                  <span class="num">{{ account.detailsStart }} ~ {{ account.detailsEnd }}</span>
                </t-descriptions-item>
                <t-descriptions-item label="Coding Plan 状态">
                  {{ account.codingPlan?.status || '—' }}
                </t-descriptions-item>
                <t-descriptions-item label="调用明细合计">
                  <span class="num">{{ totalOf(account) }}</span>
                </t-descriptions-item>
              </t-descriptions>

              <!-- 第二段：Coding Plan 额度（原卡片内区块） -->
              <t-divider align="left">
                Coding Plan 套餐额度（{{ account.codingPlan?.windows.length ?? 0 }}）
              </t-divider>
              <div v-if="(account.codingPlan?.windows.length ?? 0) > 0" class="grid-metrics">
                <div
                  v-for="window in account.codingPlan?.windows ?? []"
                  :key="window.level"
                  class="window-block"
                >
                  <t-space align="center" justify="space-between" class="window-head">
                    <strong>{{ codingWindowLabel(window.level) }}</strong>
                    <span class="muted">{{ formatReset(window.resetTime) }}</span>
                  </t-space>
                  <t-progress
                    :percentage="progressPercentage(window.percent)"
                    :status="progressStatus(window.percent)"
                    :label="false"
                  />
                  <t-space align="center" justify="space-between" class="window-meta">
                    <span class="muted">已用 {{ formatNumber(window.percent) }}%</span>
                    <span class="num">{{ formatNumber(window.percent) }}%</span>
                  </t-space>
                  <div class="muted window-foot">
                    重置于 {{ window.resetTime > 0 ? formatDateTime(window.resetTime) : '—' }}
                  </div>
                </div>
              </div>
              <t-empty v-else description="无 Coding Plan 额度数据（订阅可能已回收或未开通）" />

              <!-- 第三段：模型调用明细 -->
              <t-divider align="left">模型调用明细（{{ account.details.length }}）</t-divider>
              <t-table
                :data="detailRows(account)"
                :columns="detailsColumns"
                row-key="_key"
                max-height="360"
                size="small"
              >
                <template #time="{ row }">{{ formatDateTime(row.time) }}</template>
                <template #objectName="{ row }">{{ row.objectName }}</template>
                <template #usage="{ row }">{{ formatTokens(row.usage) }}</template>
                <template #billingType="{ row }">
                  <t-tag
                    size="small"
                    variant="light-outline"
                    :theme="row.billingType === 'WithinPlan' ? 'success' : 'warning'"
                  >
                    {{ row.billingType === 'WithinPlan' ? '套餐内' : '套餐外' }}
                  </t-tag>
                </template>
              </t-table>
              <t-empty v-if="account.details.length === 0" description="区间内没有调用明细" />

              <!-- 第四段：推理用量（原「火山方舟 推理用量」区块） -->
              <template v-if="inferenceOf(account.keyHint).ok">
                <t-divider align="left">
                  推理用量（{{ inferenceOf(account.keyHint).start }} ~
                  {{ inferenceOf(account.keyHint).end }}）
                </t-divider>
                <div class="grid-metrics detail-block">
                  <t-statistic
                    title="总 Token"
                    :value="inferenceOf(account.keyHint).totals.total"
                    :format="formatTokens"
                  />
                  <t-statistic
                    title="输入"
                    :value="inferenceOf(account.keyHint).totals.input"
                    :format="formatTokens"
                  />
                  <t-statistic
                    title="输出"
                    :value="inferenceOf(account.keyHint).totals.output"
                    :format="formatTokens"
                  />
                  <t-statistic
                    title="请求数"
                    :value="inferenceOf(account.keyHint).totals.requests"
                    separator=","
                    :decimal-places="0"
                  />
                </div>
                <t-input
                  :value="model"
                  placeholder="模型过滤（留空 = 全部）"
                  clearable
                  aria-label="模型过滤"
                  @update:value="(value: string | number) => emit('update:model', String(value))"
                />
                <t-table
                  :data="inferenceOf(account.keyHint).rows"
                  :columns="inferenceColumns"
                  row-key="_key"
                  max-height="360"
                  size="small"
                >
                  <template #day="{ row }">{{ row.day }}</template>
                  <template #inputTokens="{ row }">{{ formatTokens(row.inputTokens) }}</template>
                  <template #outputTokens="{ row }">{{ formatTokens(row.outputTokens) }}</template>
                  <template #totalTokens="{ row }">{{ formatTokens(row.totalTokens) }}</template>
                  <template #requests="{ row }">{{ formatCount(row.requests) }}</template>
                </t-table>
                <t-empty
                  v-if="inferenceOf(account.keyHint).rows.length === 0"
                  description="区间内没有推理记录（或模型过滤无命中）"
                />
              </template>
              <template v-else>
                <t-divider align="left">推理用量</t-divider>
                <t-alert
                  :theme="inferenceOf(account.keyHint).theme"
                  :message="inferenceOf(account.keyHint).message"
                  :max-line="5"
                />
              </template>
            </DetailDialog>
          </div>

          <t-alert
            v-if="isFailedAccount(account)"
            theme="error"
            :title="`${accountTitle(account)} 查询失败`"
            :message="account.error"
            :max-line="5"
          />

          <div v-else class="grid-metrics">
            <div v-for="window in account.windows" :key="window.window" class="window-block">
              <t-space align="center" justify="space-between" class="window-head">
                <strong>{{ PLAN_WINDOW_LABELS[window.window] ?? window.window }}</strong>
                <span class="muted">{{ formatReset(window.resetTime) }}</span>
              </t-space>
              <t-progress
                :percentage="progressPercentage(ratioOf(window.used, window.quota))"
                :status="progressStatus(ratioOf(window.used, window.quota))"
                :label="false"
              />
              <t-space align="center" justify="space-between" class="window-meta">
                <span class="num-strong"
                  >{{ formatTokens(window.used) }} / {{ formatTokens(window.quota) }}</span
                >
                <span class="num-strong"
                  >{{ formatNumber(ratioOf(window.used, window.quota)) }}%</span
                >
              </t-space>
              <div class="muted window-foot">
                重置 {{ window.resetTime > 0 ? formatDateTime(window.resetTime) : '—' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AccountSection>
</template>
