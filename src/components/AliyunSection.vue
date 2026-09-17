<script setup lang="ts">
/**
 * 阿里云百炼 Token 资源包（费用中心 BSS）。
 *
 * 组件只把账号列表交给 `toAliyunDetail` 变成统一模型；卡面（实例计数）与
 * 弹窗（资源包明细表）都由骨架渲染。
 */
import { computed } from 'vue'

import type { AliyunPackagesResponse } from '../types'
import { cardsOf } from '../detail'
import { toAliyunDetail } from './AliyunDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: AliyunPackagesResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toAliyunDetail))
</script>

<template>
  <AccountSection
    title="阿里云百炼 资源包"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_SECRET_KEY"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
