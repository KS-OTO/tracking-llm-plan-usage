<script setup lang="ts">
/**
 * 智谱 GLM。
 *
 * - plan 变体（套餐订阅 Tab）：卡片只留 Coding Plan 窗口额度
 * - balance 变体（余额账户 Tab）：卡片留余额读数 + 生效资源包数
 *
 * 同一个账号的两个 Tab 各展示一半，「哪一半上卡面」由适配器的 `cardFace` 决定
 * （`toZhipuDetail(account, variant)`），组件侧没有分支。
 *
 * 三个子接口（Coding Plan 额度 / 余额 / 资源包）各自独立容错：任一路失败只降级它
 * 自己那块，其余照常渲染 —— 未订阅 GLM Coding Plan 时上游会对额度接口直接 500，
 * 那不该让余额和资源包一起消失。
 */
import { computed } from 'vue'

import type { ZhipuPackagesResponse } from '../types'
import { cardsOf } from '../detail'
import { toZhipuDetail } from './ZhipuDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: ZhipuPackagesResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
  /** 卡片变体：plan = Coding Plan 额度（套餐订阅 Tab）；balance = 余额/资源包（余额账户 Tab）。 */
  variant?: 'plan' | 'balance'
}>()

const cards = computed(() =>
  cardsOf(props.data?.accounts, (account) =>
    toZhipuDetail(account, props.variant === 'balance' ? 'balance' : 'plan'),
  ),
)
</script>

<template>
  <AccountSection
    :title="variant === 'balance' ? '智谱 GLM 余额' : '智谱 GLM Coding Plan'"
    :subtitle="`账号 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 ZHIPU_API_KEY"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
