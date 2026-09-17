<script setup lang="ts">
/**
 * 阿里云百炼 Token Plan。
 *
 * 卡面只保留高优先级信息——个人版 5 小时 / 7 天窗口用量；账号身份（类型/名称/UID）、
 * 数据来源、订阅元数据（套餐/状态/剩余天数/续费周期）、加购包、重置卡明细、
 * 订阅座席表、共享包表全部进「详情」弹窗（四段骨架，见 `ui/AccountDetailPanel`）。
 *
 * 个人版用量是独立容错切片：失败时窗口区整体消失、④ 附一条告警说明原因，
 * 组织与座席视图不受影响。
 */
import { computed } from 'vue'

import type { TokenPlanResponse } from '../types'
import { cardsOf } from '../detail'
import { toTokenPlanDetail } from './TokenPlanDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: TokenPlanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toTokenPlanDetail))
</script>

<template>
  <AccountSection
    title="阿里云百炼 Token Plan"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY 或 ALIYUN_TOKENPLAN_COOKIE"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
