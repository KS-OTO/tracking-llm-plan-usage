<script setup lang="ts">
/**
 * 「套餐订阅」Tab 的订阅额度区块：**一个平台一张卡**（Kimi For Coding / MiniMax / OpenCode Go）。
 *
 * 这三家都是按窗口计的订阅额度，与火山 Agent Plan、智谱 Coding Plan、百炼 Token Plan 同类，
 * 因此与余额类平台分属不同 Tab、不同接口（`/api/plans`）。
 *
 * 为什么不是「一张订阅套餐卡里塞三组」：卡片标题会退化成「订阅套餐」这种无信息量的分组名，
 * 而同一份数据里明明有平台名（用户实测：配了 2 个 OpenCode Go Key，卡片却写着「订阅套餐」）。
 * 拆成一平台一卡后，标题即平台名，与其余 Tab 的「一平台一卡」完全一致，
 * 也让总览导航卡可以精确跳到某个平台。
 *
 * 平台名是**适配器的输入**（窗口叫法、用量端点都由它决定），因此这里用闭包传进去，
 * 而不是让适配器多接一个泛型参数。
 */
import { computed } from 'vue'

import type { PlanGroup } from '../types'
import { cardsOf } from '../detail'
import { toPlansDetail } from './PlansDetail'

import AccountCard from './ui/AccountCard.vue'
import AccountSection from './AccountSection.vue'

const props = defineProps<{
  /** 单个平台的账号分组（App.vue 按平台展开，一个平台一个网格单元）。 */
  group: PlanGroup
}>()

const cards = computed(() =>
  cardsOf(props.group.accounts, (account) => toPlansDetail(account, props.group.provider)),
)
</script>

<template>
  <AccountSection :title="group.provider" :subtitle="`订阅额度 · ${cards.length} 账号`">
    <div class="grid-cards grid-cards--wide">
      <AccountCard v-for="card in cards" :key="card.keyHint" :card="card" />
    </div>
  </AccountSection>
</template>
