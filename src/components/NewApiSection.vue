<script setup lang="ts">
/**
 * New API（自托管大模型订阅网关）额度卡片。
 *
 * 卡面可能是「订阅周期窗口」或「钱包读数」，取决于服务端判定的 `mode`；
 * 站点身份、计费模式、额度口径、统计窗口、按模型用量都在详情弹窗里。
 *
 * 卡片级外链只在**只有一个站点**时给出：多站点时链接属于各自的账号卡（弹窗内），
 * 一个「控制台」按钮指不了两个站点。
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

/** 唯一成功站点的详情（用于卡片级操作区与「可用模型」外链）；多站点时为 null。 */
const singleSite = computed(() => {
  const ok = cards.value.filter((card) => card.error === null)
  return ok.length === 1 ? (ok[0]?.detail ?? null) : null
})

const consoleUrl = computed(() =>
  singleSite.value ? linkOf(singleSite.value, 'console') : undefined,
)
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
    <template #actions>
      <a v-if="consoleUrl" class="muted" :href="consoleUrl" target="_blank" rel="noreferrer">
        控制台 ↗
      </a>
    </template>

    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
