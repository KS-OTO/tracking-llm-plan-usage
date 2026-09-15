<script setup lang="ts">
/**
 * 区块统一外壳：TDesign Card 承载，统一 loading / error / notConfigured / empty 状态。
 *
 * 状态优先级：loading → error(有数据时降级为顶部横幅) → 未配置(中性空态) → 空数据 → 内容。
 *
 * `section-card` 类（定义在 assets/layout.css）让 Card 把所在网格单元的高度继续往下传：
 * body 变纵向弹性容器、卡内 .grid-cards 吃掉剩余高度，于是「同排区块卡等高」会
 * 一路传导到卡内的账号卡与窗口块，不再出现卡内子卡片参差。
 */
import { computed } from 'vue'

import { modelDocsUrl } from '../modelDocs'

const props = defineProps<{
  title: string
  subtitle?: string
  loading?: boolean
  error?: string | null
  /** 未配置密钥（服务端 503 NOT_CONFIGURED）：中性空态而非红色错误。 */
  notConfigured?: boolean
  /** 数据为空（已配置但无记录）。 */
  empty?: boolean
  emptyText?: string
  /** 「可用模型」文档地址；省略时按卡片标题（平台名）查 modelDocs 表。 */
  modelsUrl?: string
}>()

/**
 * 标题旁的「可用模型」外链。
 *
 * 默认按平台名查表（src/modelDocs.ts）：平台卡标题即平台名，统一在外壳解析
 * 可以保证「新增平台卡自动生效」，也不会出现某张卡漏接链接。
 */
const modelsLink = computed(() => props.modelsUrl ?? modelDocsUrl(props.title))
</script>

<template>
  <t-card class="section-card" :subtitle="subtitle" header-bordered bordered>
    <template #title>
      <!-- 标题与外链同一行：链接弱化到 body-small，不与平台名抢视觉重心 -->
      <span class="section-title">
        <span>{{ title }}</span>
        <a
          v-if="modelsLink"
          class="models-link"
          :href="modelsLink"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`${title} 可用模型文档（新窗口打开）`"
        >
          可用模型 ↗
        </a>
      </span>
    </template>
    <template #actions>
      <slot name="actions" />
    </template>

    <t-skeleton v-if="loading" :loading="true" animation="gradient" :row-col="[1, 2, 3]" />
    <template v-else-if="error && empty">
      <t-alert theme="error" :message="error" :max-line="5" />
    </template>
    <template v-else-if="notConfigured">
      <t-empty :description="emptyText ?? '未配置密钥'" />
    </template>
    <template v-else>
      <!-- 刷新失败但仍有历史数据：错误横幅置顶，保留内容不闪断 -->
      <t-alert v-if="error" theme="error" :message="error" :max-line="5" />
      <t-empty v-if="empty" :description="emptyText ?? '暂无数据'" />
      <slot v-else />
    </template>
  </t-card>
</template>
