<script setup lang="ts">
/**
 * 读数瓦片（issue #20）：一个 `Metric` → 一个 `<t-statistic>`。
 *
 * 这里是**语义 → 精度**的唯一落点（#19）：适配器只声明 `kind`，精度、单位、
 * 危险色、缺值占位都在本组件里决定。于是 10 个平台的适配器不可能各写一套
 * `toFixed`，也不可能出现同一个值在卡面与弹窗里精度不同。
 *
 * 文本类读数（枚举 / 日期文案）借用 t-statistic 的排版位：`format` 的入参在这里
 * 没有意义，返回值才是要显示的东西 —— 比再造一个「文本瓦片」元素（新字号、新间距）
 * 划算得多，视觉上也不会与旁边的数字瓦片错位。
 */
import { computed } from 'vue'

import type { Metric } from '../../types'
import {
  EMPTY_VALUE,
  formatTokens,
  metricValueText,
  roundCount,
  roundNumber,
  truncateMoney,
} from '../../format'

const props = defineProps<{ metric: Metric }>()

/** 喂给 `<t-statistic>` 的属性集（显式接口：避免联合类型传给 `v-bind`）。 */
interface TileProps {
  title: string
  value: number
  format?: (value: number) => string
  decimalPlaces?: number
  separator?: string
  unit?: string
  color?: string
}

const tile = computed<TileProps>(() => {
  const { kind, value, unit, tone } = props.metric
  const base: TileProps = { title: props.metric.label, value: 0 }
  if (unit) {
    base.unit = unit
  }
  if (tone === 'danger') {
    base.color = 'red'
  }
  if (kind === 'text' || kind === 'duration') {
    return { ...base, format: () => metricValueText(props.metric) }
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    // 缺值不伪造 0（「没有值」≠「值为零」），与文本读数走同一条占位路径
    return { ...base, format: () => EMPTY_VALUE }
  }
  if (kind === 'money') {
    return { ...base, value: truncateMoney(value), decimalPlaces: 2 }
  }
  if (kind === 'count') {
    return { ...base, value: roundCount(value), decimalPlaces: 0, separator: ',' }
  }
  if (kind === 'tokens') {
    return { ...base, value, format: formatTokens }
  }
  return { ...base, value: roundNumber(value), decimalPlaces: 1 }
})
</script>

<template>
  <t-statistic v-bind="tile" />
</template>
