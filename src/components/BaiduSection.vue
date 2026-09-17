<script setup lang="ts">
/**
 * 百度智能云千帆。
 *
 * 组件只把账号列表交给 `toBaiduDetail` 变成统一模型；卡面是近 7 天用量三项，
 * 量包明细与 TPM 配额两张表进弹窗。
 */
import { computed } from 'vue'

import type { BaiduQianfanResponse } from '../types'
import { cardsOf } from '../detail'
import { toBaiduDetail } from './BaiduDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: BaiduQianfanResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toBaiduDetail))
</script>

<template>
  <AccountSection
    title="百度千帆"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 BAIDU_ACCESS_KEY_ID / BAIDU_SECRET_KEY"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
