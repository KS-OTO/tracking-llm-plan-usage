<script setup lang="ts">
/**
 * 区块统一外壳：TDesign Card 承载，统一 loading / error / empty 状态。
 *
 * 每个 ProviderSection 用本组件包裹，保持展示型组件契约（data/loading/error props）。
 * - loading → Skeleton 骨架
 * - error   → Alert 告警（theme=error）
 * - empty   → Empty 空状态（由调用方通过 empty 明确传入，避免依赖插槽探测）
 * - 正常     → 默认插槽
 */
defineProps<{
  title: string
  subtitle?: string
  loading?: boolean
  error?: string | null
  /** 是否展示空状态（如「未配置 XXX_KEY」）。 */
  empty?: boolean
  /** 空状态文案。 */
  emptyText?: string
}>()
</script>

<template>
  <t-card :title="title" :subtitle="subtitle" header-bordered bordered>
    <template #actions>
      <slot name="actions" />
    </template>

    <t-skeleton v-if="loading" :loading="true" animation="gradient" :row-col="[1, 2, 3]" />
    <template v-else-if="error && empty">
      <t-alert theme="error" :message="error" :max-line="5" />
    </template>
    <template v-else>
      <!-- 刷新失败但仍有历史数据：错误横幅置顶，保留内容不闪断 -->
      <t-alert v-if="error" theme="error" :message="error" :max-line="5" />
      <t-empty v-if="empty" :description="emptyText" />
      <slot v-else />
    </template>
  </t-card>
</template>
