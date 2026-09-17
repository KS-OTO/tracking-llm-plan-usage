<script setup lang="ts">
/**
 * 火山方舟 Agent Plan。
 *
 * 卡面只保留高优先级读数——Agent Plan 各窗口的额度进度；Coding Plan 窗口、
 * 模型调用明细、推理用量全部进「详情」弹窗（四段骨架，见 `ui/AccountDetailPanel`）。
 *
 * 为什么推理用量也并进来：它和 Agent Plan / Coding Plan 用的是**同一对 AK/SK**、
 * 归属同一个火山方舟账号，单独占一张区块卡只会让「套餐订阅」Tab 多一个只放一行的卡片；
 * 而它本身就是明细级数据（按天 × 按模型的表格），与「详情」弹窗的定位一致。
 *
 * 推理用量走独立接口（`/api/volc/inference-usage`，支持 model 过滤），因此这里按
 * keyHint 与 Agent Plan 的账号配对后再交给适配器 —— 配对逻辑是**组件的事**
 * （它拿得到两个切片），适配器只负责把配好的数据搬进模型。
 */
import { computed } from 'vue'

import type { InferenceUsageResponse, VolcPlanResponse } from '../types'
import type { InferenceView } from './VolcPlanDetail'
import { cardsOf } from '../detail'
import { buildInferenceView, isInferenceTable, toVolcPlanDetail } from './VolcPlanDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: VolcPlanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
  /** 推理用量（独立切片，可能整体失败）。 */
  inference: InferenceUsageResponse | null
  inferenceError: string | null
  /** 推理用量的模型过滤（受控，改动经 update:model 冒泡到 store）。 */
  model: string
}>()

const emit = defineEmits<{
  'update:model': [value: string]
}>()

/** 账号 keyHint → 推理用量视图（只随 props 变化重算，适配器按账号取用）。 */
const inferenceByAccount = computed<Map<string, InferenceView>>(() => {
  const map = new Map<string, InferenceView>()
  for (const account of props.data?.accounts ?? []) {
    map.set(
      account.keyHint,
      buildInferenceView(props.inference, props.inferenceError, account.keyHint),
    )
  }
  return map
})

function inferenceOf(keyHint: string): InferenceView {
  return (
    inferenceByAccount.value.get(keyHint) ??
    buildInferenceView(props.inference, props.inferenceError, keyHint)
  )
}

const cards = computed(() =>
  cardsOf(props.data?.accounts, (account) =>
    toVolcPlanDetail(account, inferenceOf(account.keyHint)),
  ),
)
</script>

<template>
  <AccountSection
    title="火山方舟 Agent Plan"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card">
        <!-- 本平台唯一一个自定义槽：推理用量的模型过滤（见 VolcPlanDetail 的 INFERENCE_TABLE_TITLE） -->
        <template #table-actions="{ table }">
          <t-input
            v-if="isInferenceTable(table.title)"
            :value="model"
            placeholder="模型过滤（留空 = 全部）"
            clearable
            aria-label="模型过滤"
            @update:value="(value: string | number) => emit('update:model', String(value))"
          />
        </template>
      </AccountCard>
    </div>
  </AccountSection>
</template>
