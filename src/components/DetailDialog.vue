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
  /** 平台控制台地址：放在标题行右侧，与关闭按钮同级。 */
  consoleUrl?: string
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
  <!-- 桌面宽度意图由 width 给出；窄屏宽度兜底与高度封顶统一在 assets/layout.css。
       placement 必须显式给 center：TDesign 默认 'top' 会把弹窗顶边钉在视口 20% 处
       （`.t-dialog--top { align-items:flex-start; padding-top:20vh }`），
       看起来就是「没有相对屏幕居中」——留白在外层容器上，用 CSS 兜底改不动。 -->
  <t-dialog
    v-if="visible"
    v-model:visible="visible"
    :footer="false"
    width="720px"
    placement="center"
    attach="body"
  >
    <!-- 控制台入口必须贴着标题行：弹窗正文只放数据，外链不跟着滚动内容走 -->
    <template #header>
      <div class="detail-dialog-header">
        <span class="detail-dialog-title">{{ title }}</span>
        <a
          v-if="consoleUrl"
          class="detail-dialog-console"
          :href="consoleUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          控制台 ↗
        </a>
      </div>
    </template>
    <div v-if="subtitle" class="muted detail-subtitle">Key {{ subtitle }}</div>
    <slot />
  </t-dialog>
</template>

<style scoped>
.detail-trigger {
  margin-left: auto;
  flex-shrink: 0;
}

/* TDesign 的 header 插槽渲染在 .t-dialog__header-content 内：
 * 让标题与「控制台」同一行，链接靠右，紧邻关闭按钮。 */
.detail-dialog-header {
  display: flex;
  align-items: center;
  gap: var(--td-size-4);
  width: 100%;
  min-width: 0;
}

.detail-dialog-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-dialog-console {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--td-text-color-brand);
  font-size: var(--td-font-size-body-small);
  font-weight: normal;
  text-decoration: none;
}

.detail-dialog-console:hover,
.detail-dialog-console:focus-visible {
  text-decoration: underline;
}
</style>
