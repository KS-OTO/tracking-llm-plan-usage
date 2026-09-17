<script setup lang="ts">
/**
 * `DataTable` → 分节 + 汇总读数 + `t-table`（issue #20）。
 *
 * 行值由适配器**格式化好**（表格里不放渲染逻辑），因此列定义只需 `cell: key`
 * 指向同名字段。唯一需要插槽的是 `kind: 'status'` 的列 —— 它渲染成状态标签，
 * 配色由 `utils.statusTheme` 的共享词表决定，平台侧只声明「这列是状态」。
 *
 * 插槽里的 `row` 会遮蔽外层的 `row`，这类遮蔽错误编译期不报，所以除了状态列
 * 一律不用插槽。
 */
import { computed } from 'vue'

import type { DataTable } from '../../types'
import { metricGridClass, statusTheme } from '../../utils'

import DetailSection from './DetailSection.vue'
import MetricTile from './MetricTile.vue'

const props = defineProps<{ table: DataTable }>()

const columns = computed(() =>
  props.table.columns.map((column) => ({
    colKey: column.key,
    title: column.label,
    align: column.align ?? 'left',
    cell: column.key,
  })),
)

/** 状态列（渲染成标签）的键；其余列走 TDesign 的默认单元格。 */
const statusKeys = computed(() =>
  props.table.columns.filter((column) => column.kind === 'status').map((column) => column.key),
)

const summary = computed(() => props.table.summary ?? [])
</script>

<template>
  <DetailSection :title="table.title" :rows="table.rows.length" :empty-text="table.emptyText">
    <div v-if="summary.length > 0" :class="metricGridClass(summary.length)">
      <MetricTile v-for="metric in summary" :key="metric.key" :metric="metric" />
    </div>
    <t-table :data="table.rows" :columns="columns" row-key="_key" max-height="360" size="small">
      <template v-for="key in statusKeys" :key="key" #[key]="{ row }">
        <t-tag size="small" variant="light-outline" :theme="statusTheme(String(row[key] ?? ''))">
          {{ row[key] }}
        </t-tag>
      </template>
    </t-table>
    <!-- 平台专属的表格工具（如火山推理用量的模型过滤）；最多一个平台用得上 -->
    <slot name="actions" />
  </DetailSection>
</template>
