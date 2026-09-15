<script setup lang="ts">
/**
 * 「详情」二次入口：把低优先级信息（账号身份、订阅元数据、明细表、次级指标）
 * 收进弹窗，卡片只留高优先级读数——团队日常只看卡片，需要时才展开。
 *
 * 用 `v-if` 控制弹窗挂载（而不只是 `v-show`）：未打开时不产生任何 DOM，
 * 既避免隐藏的明细表拖慢长列表渲染，也让「低优先级字段已移出卡片」可被测到。
 * 注意 TDesign Dialog 会 teleport 到 `attach`（默认 body），弹窗内容不在卡片内。
 */
import { ref } from 'vue'

defineProps<{
  /** 弹窗标题：账号别名优先（无别名时为 Key 掩码）。 */
  title: string
  /** 副标题：通常是 Key 掩码，用于在多个同名别名之间消歧。 */
  subtitle?: string
}>()

const visible = ref(false)
</script>

<template>
  <t-button
    class="detail-trigger"
    size="small"
    variant="text"
    theme="primary"
    @click="visible = true"
  >
    详情
  </t-button>
  <!-- 桌面宽度意图由 width 给出；窄屏兜底（max-width:100vw-2*16px）统一在 assets/layout.css -->
  <t-dialog
    v-if="visible"
    v-model:visible="visible"
    :header="title"
    :footer="false"
    width="720px"
    attach="body"
  >
    <div v-if="subtitle" class="muted detail-subtitle">Key {{ subtitle }}</div>
    <slot />
  </t-dialog>
</template>

<style scoped>
.detail-trigger {
  margin-left: auto;
  flex-shrink: 0;
}
</style>
