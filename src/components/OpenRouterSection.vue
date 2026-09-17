<script setup lang="ts">
/**
 * OpenRouter。
 *
 * 组件只把账号列表交给 `toOpenRouterDetail` 变成统一模型；卡面是额度三项
 * （限额余量 < 1 美元标红），密钥元数据进弹窗。
 */
import { computed } from 'vue'

import type { OpenRouterDetailResponse } from '../types'
import { cardsOf } from '../detail'
import { toOpenRouterDetail } from './OpenRouterDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: OpenRouterDetailResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toOpenRouterDetail))
</script>

<template>
  <AccountSection
    title="OpenRouter"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 OPENROUTER_API_KEY"
  >
    <template #actions>
      <a class="muted" href="https://openrouter.ai/credits" target="_blank" rel="noreferrer">
        控制台 ↗
      </a>
    </template>

    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
