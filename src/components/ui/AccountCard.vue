<script setup lang="ts">
/**
 * 账号卡（issue #20）：卡头 + 告警 / 正文 + 详情弹窗。
 *
 * 10 个平台的账号卡结构完全一致，差别只在 `AccountDetail` 的内容，
 * 因此这里也收敛成一个组件。改之前每个 Section 都各写一遍卡头
 * （别名 + Key 掩码 + 可选标签 + 详情入口）与失败告警，共 10 份。
 *
 * 详情弹窗的标题/副标题规则也在这里：**别名优先**，无别名退化为 Key 掩码；
 * 副标题只在「别名与 Key 都要显示」时才给（避免同一串 Key 出现两次）。
 */
import type { AccountCard, DataTable } from '../../types'
import { accountTitle } from '../../types'

import AccountCardBody from './AccountCardBody.vue'
import AccountDetailPanel from './AccountDetailPanel.vue'
import DetailDialog from '../DetailDialog.vue'

defineProps<{ card: AccountCard }>()

/**
 * 平台专属的表格工具插槽：目前只有火山推理用量的「模型过滤」用得上。
 * 显式声明类型 + 逐字段转发（不用 `v-bind="slotProps"`）—— 两层 `v-bind` 透传时
 * vue-tsc 推不出插槽属性的类型，模板里取 `table` 会变成 any。
 */
defineSlots<{
  'table-actions'?: (props: { table: DataTable; index: number }) => unknown
}>()
</script>

<template>
  <div class="account-group">
    <div class="account-head">
      <span v-if="card.label" class="account-name">{{ card.label }}</span>
      <span class="key-hint" :class="{ 'key-hint-secondary': card.label }">{{ card.keyHint }}</span>
      <t-tag
        v-if="card.detail?.badge"
        size="small"
        variant="light-outline"
        :theme="card.detail.badge.theme"
      >
        {{ card.detail.badge.label }}
      </t-tag>
      <DetailDialog
        v-if="card.detail"
        :title="accountTitle(card)"
        :subtitle="card.label ? card.keyHint : undefined"
      >
        <AccountDetailPanel :detail="card.detail">
          <template #table-actions="{ table, index }">
            <slot name="table-actions" :table="table" :index="index" />
          </template>
        </AccountDetailPanel>
      </DetailDialog>
    </div>

    <t-alert
      v-if="card.error !== null"
      theme="error"
      :title="`${accountTitle(card)} 查询失败`"
      :message="card.error"
      :max-line="5"
    />
    <AccountCardBody v-else-if="card.detail" :detail="card.detail" />
  </div>
</template>

<style scoped>
/* 卡头与卡面布局统一在 assets/layout.css，此处无区块特有样式 */
</style>
