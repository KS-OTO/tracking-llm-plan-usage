<script setup lang="ts">
/**
 * `Field[]` → `t-descriptions`（issue #20）。
 *
 * 全部 `.detail-block` 的 `t-descriptions` 走这一个组件，于是
 * **列数恒为 2**（历史上 `PlansSection` 是唯一一个 `:column="1"`，无注释、无人知道原因），
 * 需要独占一行的长字段用 `Field.span = 2`，而不是整表降成 1 列。
 */
import type { Field } from '../../types'

defineProps<{ fields: Field[] }>()
</script>

<template>
  <t-descriptions :column="2" size="small">
    <t-descriptions-item
      v-for="item in fields"
      :key="item.label"
      :label="item.label"
      :span="item.span ?? 1"
    >
      <span>{{ item.value }}</span>
      <span v-if="item.hint" class="muted"> {{ item.hint }}</span>
    </t-descriptions-item>
  </t-descriptions>
</template>
