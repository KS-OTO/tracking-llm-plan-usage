<script setup lang="ts">
/**
 * DeepSeek 余额。
 *
 * 组件只做两件事：把响应里的账号列表交给适配器（`toDeepSeekDetail`）变成
 * 统一模型，然后照骨架渲染。**不再 import 平台字段**，也不再自己拼卡面与弹窗 ——
 * 卡型由适配器往哪个数组放了什么决定（本平台 = B 余额型）。
 */
import { computed } from 'vue'

import type { DeepSeekBalanceResponse } from '../types'
import { cardsOf } from '../detail'
import { toDeepSeekDetail } from './DeepSeekDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: DeepSeekBalanceResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toDeepSeekDetail))
</script>

<template>
  <AccountSection
    title="DeepSeek 余额"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 DEEPSEEK_API_KEY"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
