<script setup lang="ts">
/**
 * 通用余额区块（StepFun / SiliconFlow / Novita AI / Sub2API）。
 *
 * 一个平台一张卡；卡面只显示剩余额度，总额 / 已用 / 现金 / 赠金等维度进详情弹窗。
 */
import { computed } from 'vue'

import type { SimpleBalanceResponse } from '../types'
import { cardsOf } from '../detail'
import { toBalanceDetail } from './BalanceDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  title: string
  /** 未配置时提示的环境变量名。 */
  envHint: string
  /** 控制台地址（可选）。 */
  consoleUrl?: string
  data: SimpleBalanceResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toBalanceDetail))
</script>

<template>
  <AccountSection
    :title="title"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    :empty-text="`未配置 ${envHint}`"
  >
    <template v-if="consoleUrl" #actions>
      <a class="muted" :href="consoleUrl" target="_blank" rel="noreferrer">控制台 ↗</a>
    </template>

    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
