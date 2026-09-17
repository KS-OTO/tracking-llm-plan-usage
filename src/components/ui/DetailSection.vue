<script setup lang="ts">
/**
 * 弹窗内的一个分节（issue #20）：**自带分节标题与空态**。
 *
 * 存在的理由：① 分节标题以前是各组件手工摆 `<t-divider align="left">`（Baidu 2 处 /
 * VolcPlan 4 处 / TokenPlan 3 处），标题里还各自拼计数；② 空态文案各写各的
 * （「没有资源包」/「无量包（可在千帆控制台购买 Token 量包）」/「没有生效中的资源包」）。
 * 现在标题格式与空态文案只在这里定义一次。
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 分节名（bare 名词，不要自己带计数 —— 计数由 `rows` 渲染）。 */
  title?: string
  /**
   * 明细行数。给了且为 0 → 渲染空态；不给 → 永远渲染插槽
   * （用于「有没有内容由插槽自己决定」的场合，如读数瓦片）。
   */
  rows?: number
  /** 空态文案；缺省按标题生成「没有<标题>」。 */
  emptyText?: string
}>()

/** 标题 + 计数合成一个插值：分两处插值会被格式化工具换行，凭空多出空格。 */
const heading = computed(() => {
  if (!props.title) {
    return ''
  }
  const count = props.rows
  return count !== undefined && count > 0 ? `${props.title}（${count}）` : props.title
})

const isEmpty = computed(() => props.rows !== undefined && props.rows === 0)
</script>

<template>
  <section class="detail-section">
    <t-divider v-if="heading" align="left">{{ heading }}</t-divider>
    <slot v-if="!isEmpty" />
    <t-empty v-else :description="emptyText ?? `没有${title ?? '数据'}`" />
  </section>
</template>

<style scoped>
/* 分节本身的间距由父容器（AccountDetailPanel 的 flex gap）统一给，
 * 这里不加 margin —— 两处都给间距会叠加成双倍。 */
.detail-section {
  display: block;
}
</style>
