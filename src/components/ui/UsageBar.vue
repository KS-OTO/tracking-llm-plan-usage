<script setup lang="ts">
/**
 * 统一用量条（issue #18）：时间窗口额度（W 语义）的**唯一**渲染方式。
 *
 * 改之前，5 个组件各写一份「标题行 + 进度条 + 数值行 + 脚注行」，于是同一语义有 3–4 种长相：
 *   - 属性不齐：`NewApiSection` 少了 `:status` 与 `:label="false"` → 进度条既不变色、
 *     又保留 TDesign 默认百分比标签（与数值行重复）；
 *   - 分段不齐：`TokenPlanSection` 没有脚注行、`NewApiSection` 没有标题行；
 *   - 同一数字一行出现两次：`PlansSection` / `TokenPlanSection` / `VolcPlanSection` 的
 *     数值行左右都是百分比（`已用 62.4%` 与 `62.4%`）。
 *
 * 现在四段结构固定、每段可选，**顺序与间距全部由本组件负责**，调用方只传数据。
 * 几何与属性取「TDesign 默认 + 项目多数派」（见 docs/design-baseline.md 第 0 节）：
 * 不覆盖进度条高度/圆角，只统一 `percentage` / `status` / `label` 三个属性。
 */
import type { WindowQuota } from '../../types'
import { computed } from 'vue'
import {
  formatCount,
  formatMoney,
  formatNumber,
  formatTokens,
  progressPercentage,
} from '../../format'
import {
  formatDateTime,
  formatReset,
  progressStatus,
  windowStatusLabel,
  windowStatusNote,
} from '../../utils'

const props = defineProps<{
  quota: WindowQuota
  /** 数值行左标签，默认「已用」。 */
  usedLabel?: string
}>()

/**
 * 有 used/total 就显示「已用 40.0K / 64.0K」，否则退化成「已用 62.4%」。
 *
 * 退化时右侧**不再重复**百分比 —— 那正是三个组件的老毛病（同一数字一行两次）。
 */
const hasCounts = computed(() => props.quota.used !== null && props.quota.total !== null)

/**
 * 单位与数值的摆法（#19 的「单位是独立元素」在这一条里落地）。
 *
 * - **货币**：符号**前置到每个数值**（`¥12.00 / ¥100.00`）。写成行尾一个 `¥`
 *   （`12.00 / 100.00 ¥`）省字符，但两个数字之间没有分隔，读者要靠猜才知道单位作用于整个区间。
 * - **其他单位**（Tokens / 次）：量纲只出现**一次**、跟在整对数值之后（`40.0K / 64.0K 次`）。
 *   逐个数字挂量纲会把一行撑成 `40.0K 次 / 64.0K 次`，两倍的冗余。
 */
function countText(value: number): string {
  const kind = props.quota.countKind ?? 'tokens'
  if (kind === 'money') {
    return formatMoney(value)
  }
  return kind === 'count' ? formatCount(value) : formatTokens(value)
}

const isMoney = computed(() => props.quota.countKind === 'money')

/** 单个数值 + 单位（脚注的「剩余」用）。 */
function amountText(value: number): string {
  const text = countText(value)
  const unit = props.quota.unit
  if (!unit) {
    return text
  }
  return isMoney.value ? `${unit}${text}` : `${text} ${unit}`
}

/** 一对数值 + 单位（数值行的「已用 X / Y」用）。 */
function pairText(used: number, total: number): string {
  const unit = props.quota.unit
  if (isMoney.value) {
    return unit
      ? `${unit}${countText(used)} / ${unit}${countText(total)}`
      : `${countText(used)} / ${countText(total)}`
  }
  const pair = `${countText(used)} / ${countText(total)}`
  return unit ? `${pair} ${unit}` : pair
}

const usedText = computed(() => {
  const label = props.usedLabel ?? '已用'
  const { used, total, percent } = props.quota
  if (used === null || total === null) {
    return `${label} ${formatNumber(percent)}%`
  }
  return `${label} ${pairText(used, total)}`
})

/** 右侧百分比：仅在有计数时出现，避免与左侧重复。 */
const percentText = computed(() => (hasCounts.value ? `${formatNumber(props.quota.percent)}%` : ''))

const resetText = computed(() => formatReset(props.quota.resetAt ?? -1))

/**
 * ④ 脚注行：剩余量 · 重置时刻 · 上游状态说明 · 平台补充说明。
 *
 * 上游状态说明放这里而不是标题旁：标题行已经被「窗口名 + 倒计时」占满，
 * 塞进去会把窗口名挤成省略号；而这类说明本来就是「看一眼就走」的次级信息。
 * 重置**时刻**与标题行的重置**倒计时**不是同一件事，两者都留 —— 一个回答「还有多久」，
 * 一个回答「具体什么时候」，后者是排障与对账时真正要抄下来的值。
 */
const footText = computed(() => {
  const { remaining, resetAt, status, note } = props.quota
  const parts: string[] = []
  if (remaining !== null) {
    parts.push(`剩余 ${amountText(remaining)}`)
  }
  if (resetAt !== null && resetAt > 0) {
    parts.push(`重置于 ${formatDateTime(resetAt)}`)
  }
  if (status) {
    parts.push(windowStatusNote(status))
  }
  if (note) {
    // 平台专属说明随窗口从模型里来（`WindowQuota.note`），不由调用方另外传 prop
    parts.push(note)
  }
  return parts.join(' · ')
})
</script>

<template>
  <div class="window-block">
    <!-- ① 标题行：窗口名（+ 上游状态标签） · 重置倒计时 -->
    <t-space align="center" justify="space-between" class="window-head">
      <t-space align="center" size="small">
        <strong>{{ quota.label }}</strong>
        <t-tag v-if="quota.status" size="small" theme="warning" variant="light-outline">
          {{ windowStatusLabel(quota.status) }}
        </t-tag>
      </t-space>
      <span class="muted">{{ resetText }}</span>
    </t-space>

    <!-- ② 进度条：三个属性与多数派一致；几何交给 TDesign 默认 -->
    <t-progress
      :percentage="progressPercentage(quota.percent)"
      :status="progressStatus(quota.percent)"
      :label="false"
    />

    <!-- ③ 数值行 -->
    <t-space align="center" justify="space-between" class="window-meta">
      <span class="num-strong">{{ usedText }}</span>
      <span v-if="percentText" class="num-strong">{{ percentText }}</span>
    </t-space>

    <!-- ④ 脚注行（可选） -->
    <div v-if="footText" class="muted window-foot">{{ footText }}</div>
  </div>
</template>

<style scoped>
/* 布局与卡片内公共块统一在 assets/layout.css，此处无区块特有样式 */
</style>
