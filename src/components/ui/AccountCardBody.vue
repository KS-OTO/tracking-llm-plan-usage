<script setup lang="ts">
/**
 * 账号卡正文（issue #20）：`AccountDetail` → 卡面读数带。
 *
 * 卡面 = **W 窗口 + B 余额 + 其余读数**里 `cardFace !== false` 的那些。
 * 于是「卡型」（#22 的 A 窗口 / B 余额 / C 窗口+余额 / D 资源包）不再由组件声明，
 * 而是**自动由适配器放进哪些数组决定** —— 组件侧连一个 if 都没有。
 */
import { computed } from 'vue'

import type { AccountDetail } from '../../types'
import { cardMetrics, cardWindows } from '../../detail'
import { metricGridClass, windowContainerClass } from '../../utils'

import MetricTile from './MetricTile.vue'
import UsageBar from './UsageBar.vue'

const props = defineProps<{ detail: AccountDetail }>()

const windows = computed(() => cardWindows(props.detail))
const metrics = computed(() => cardMetrics(props.detail))

/**
 * 卡面上的告警：**只渲染适配器显式标了 `cardFace` 的**。
 *
 * 默认只进弹窗（④）—— 弹窗里再放一遍会让人以为数据是坏的；而「这个站点没给额度口径，
 * 所以读数没有货币符号」这类说明必须第一眼可见，由适配器显式置位。
 */
const notices = computed(() => props.detail.notices.filter((item) => item.cardFace === true))
</script>

<template>
  <div v-if="windows.length > 0" :class="windowContainerClass(windows.length)">
    <UsageBar v-for="window in windows" :key="window.key" :quota="window" />
  </div>
  <div v-if="metrics.length > 0" :class="metricGridClass(metrics.length)">
    <MetricTile v-for="metric in metrics" :key="metric.key" :metric="metric" />
  </div>
  <template v-for="(item, index) in notices" :key="`notice-${index}`">
    <t-alert
      v-if="item.level !== 'info'"
      :theme="item.level === 'error' ? 'error' : 'warning'"
      :message="item.text"
      :max-line="4"
    />
    <p v-else class="muted">{{ item.text }}</p>
  </template>
</template>

<style scoped>
/* 卡内块间距由 .account-group 的 gap 统一给，这里不加 margin */
</style>
