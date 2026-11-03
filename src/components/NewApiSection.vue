<script setup lang="ts">
/**
 * New API（自托管大模型订阅网关）额度卡片。
 *
 * 卡面可能是「订阅周期窗口」或「钱包读数」，取决于服务端判定的 `mode`；
 * 站点身份、计费模式、额度口径、统计窗口、按模型用量都在详情弹窗里。
 *
 * 卡片级外链只在**只有一个站点**时给出「可用模型」；控制台入口统一放到
 * 各账号详情弹窗的标题行，避免一个区块级按钮指错站点。
 */
import { computed } from 'vue'

import type { NewApiResponse } from '../types'
import { cardsOf, linkOf } from '../detail'
import { toNewApiDetail } from './NewApiDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  data: NewApiResponse | null
  loading: boolean
  error: string | null
  notConfigured?: boolean
}>()

const cards = computed(() => cardsOf(props.data?.accounts, toNewApiDetail))

/** 唯一成功站点的详情（用于「可用模型」外链）；多站点时为 null。 */
const singleSite = computed(() => {
  const ok = cards.value.filter((card) => card.error === null)
  return ok.length === 1 ? (ok[0]?.detail ?? null) : null
})

const modelsUrl = computed(() =>
  singleSite.value ? linkOf(singleSite.value, 'models') : undefined,
)
</script>

<template>
  <AccountSection
    title="New API"
    :subtitle="`站点 ${cards.length}`"
    :loading="loading"
    :error="error"
    :not-configured="notConfigured"
    :empty="cards.length === 0"
    empty-text="未配置 NEWAPI_BASE_URL / NEWAPI_TOKEN"
    :models-url="modelsUrl"
  >
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
