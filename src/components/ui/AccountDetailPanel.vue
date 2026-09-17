<script setup lang="ts">
/**
 * 账号详情面板（issue #20）：`AccountDetail` → 弹窗正文的**四段骨架**。
 *
 * 顺序与分区对所有平台恒定，组件侧零平台分支：
 *   ① 身份（`identity`）
 *   ② 读数（`windows` 用用量条 · `balances` + `metrics` 用读数瓦片）
 *   ③ 明细（`meta` 扩展字段 · `tables` 明细表，空表自动空态）
 *   ④ 附加（`notices` 告警 + `links` 外链，统一沉底）
 *
 * 告警放最后而不是贴着出问题的分节：弹窗是用来**核对数据**的，
 * 把红色告警插在表格旁会让人以为这份数据本身是坏的。卡面上的告警已经负责
 * 「第一眼发现问题」，这里只负责「解释哪一块为什么是空的」。
 */
import { computed } from 'vue'

import type { AccountDetail } from '../../types'
import { metricGridClass, windowContainerClass } from '../../utils'

import DetailFields from './DetailFields.vue'
import DetailSection from './DetailSection.vue'
import DetailTable from './DetailTable.vue'
import MetricTile from './MetricTile.vue'
import UsageBar from './UsageBar.vue'

const props = defineProps<{ detail: AccountDetail }>()

/**
 * ② 读数瓦片 = `balances` + `metrics`。
 *
 * 两者分开只是为了表达语义（B 余额 vs 其余读数），渲染完全同构 ——
 * 于是「余额型卡片」与「计数型卡片」的差别退化成适配器往哪个数组放，
 * 组件侧没有任何 if。
 */
const readings = computed(() => [...props.detail.balances, ...props.detail.metrics])

const alertTheme = (level: AccountDetail['notices'][number]['level']) =>
  level === 'error' ? 'error' : 'warning'
</script>

<template>
  <div class="account-detail">
    <!-- ① 身份 -->
    <DetailFields :fields="detail.identity" />

    <!-- ② 读数：W 窗口 + B/其余读数（弹窗里给全部窗口，含 cardFace=false 的） -->
    <DetailSection v-if="detail.windows.length > 0" title="额度窗口">
      <div :class="windowContainerClass(detail.windows.length)">
        <UsageBar v-for="window in detail.windows" :key="window.key" :quota="window" />
      </div>
    </DetailSection>
    <DetailSection v-if="readings.length > 0" title="读数">
      <div :class="metricGridClass(readings.length)">
        <MetricTile v-for="metric in readings" :key="metric.key" :metric="metric" />
      </div>
    </DetailSection>

    <!-- ③ 平台特有字段（唯一允许自由发挥的区）+ 明细表 -->
    <DetailFields v-if="detail.meta.length > 0" :fields="detail.meta" />
    <DetailTable v-for="(item, index) in detail.tables" :key="item.title" :table="item">
      <template #actions>
        <slot name="table-actions" :table="item" :index="index" />
      </template>
    </DetailTable>

    <!-- ④ 附加：告警与外链统一沉底 -->
    <t-alert
      v-for="(item, index) in detail.notices"
      :key="`notice-${index}`"
      :theme="alertTheme(item.level)"
      :message="item.text"
      :max-line="5"
    />
    <p v-if="detail.links.length > 0" class="detail-links">
      <a
        v-for="item in detail.links"
        :key="item.url"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ item.label }} ↗
      </a>
    </p>
  </div>
</template>

<style scoped>
/* 段间距只由这里给（子分节一律不带外边距，两处都给会叠加成双倍） */
.account-detail {
  display: flex;
  flex-direction: column;
  gap: var(--td-size-5);
}
</style>
