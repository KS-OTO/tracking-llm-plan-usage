<script setup lang="ts">
/**
 * 模力方舟（Gitee AI）。
 *
 * 组件只把账号列表交给 `toGiteeDetail` 变成统一模型；卡面是余额三项，
 * 资源包明细与代金券两张表（含代金券余额汇总）进弹窗。
 */
import { computed } from 'vue'

import type { GiteeBalanceResponse } from '../types'
import { cardsOf } from '../detail'
import { toGiteeDetail } from './GiteeDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: GiteeBalanceResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toGiteeDetail))
</script>

<template>
  <AccountSection
    title="模力方舟（Gitee AI）"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 GITEE_AI_API_KEY"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
