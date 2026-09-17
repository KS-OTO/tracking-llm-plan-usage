import type { SiteConfig } from './types'

/** 掩码展示密钥，仅保留首尾各 4 位。 */
export function maskKey(key: string): string {
  if (key.length <= 8) {
    return '****'
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

/** 配额使用百分比（0-100 封顶）。 */
export function ratioOf(used: number, quota: number): number {
  return quota > 0 ? Math.min(100, (used / quota) * 100) : 0
}

/** 配额重置倒计时；resetTime <= 0 表示该窗口未启用。 */
export function formatReset(ms: number): string {
  if (ms <= 0) {
    return '—'
  }
  const diff = ms - Date.now()
  if (diff <= 0) {
    return '已重置'
  }
  const hours = Math.floor(diff / 3_600_000)
  if (hours >= 48) {
    return `${Math.floor(hours / 24)} 天后重置`
  }
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return `${hours} 小时 ${minutes} 分后重置`
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

export const PLAN_WINDOW_LABELS: Record<string, string> = {
  fiveHour: '5 小时窗口',
  daily: '每日窗口',
  weekly: '每周窗口',
  monthly: '每月窗口',
}

/**
 * 上游窗口状态的展示文案；未收录的状态**原样回退**显示，不隐藏信息。
 *
 * 放在这里而不是组件里：`.window-head` 上的状态标签由统一用量条渲染，
 * 谁能给出状态、谁能翻译状态必须是同一份映射，否则加了新平台又要在两处各写一遍。
 */
const WINDOW_STATUS_LABELS: Record<string, string> = {
  'rate-limited': '上游限流中',
}

export function windowStatusLabel(status: string): string {
  return WINDOW_STATUS_LABELS[status] ?? status
}

/** 状态标签的解释文案（脚注行用）；与 `windowStatusLabel` 成对维护。 */
export function windowStatusNote(status: string): string {
  return status === 'rate-limited'
    ? '该窗口已被上游限流，期间的请求可能被拒绝；百分比仍为已用额度'
    : `上游返回的窗口状态：${status}`
}

/**
 * 窗口区容器：由**窗口个数**决定，不由平台决定（#18）。
 *
 * | 窗口数 | 容器                | 理由                     |
 * | ------ | ------------------- | ------------------------ |
 * | 1–2 个 | `.grid-metrics(--2)` | 并排等宽，读数好对比     |
 * | ≥3 个  | `.window-list`       | 纵向等分，跨账号逐行对齐 |
 *
 * 这条规则同时消灭了「同一张卡里混用两种容器」——历史上 `NewApiSection` 就是
 * 一张卡里用了一半 `.window-list`、一半 `.window-block` 网格，两处节奏不同。
 */
export function windowContainerClass(count: number): string {
  return count >= 3 ? 'window-list' : metricGridClass(count)
}

/**
 * 平台名 → 锚点 slug（跨组件共享，保证「跳转方」与「落点方」用同一套命名）。
 *
 * 订阅套餐按平台拆卡后，每张卡一个锚点：`anchor-plans-<slug>`。
 * 若两处各写各的转换，改个平台名就会静默跳失（锚点找不到时 jumpToAnchor 直接 return，
 * 表现为「点了没反应」这种最难查的症状）。
 */
export function providerSlug(provider: string): string {
  return (
    provider
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  )
}

/**
 * 读数个数 → 读数网格的变体 class（#19）。
 *
 * 列数由**读数个数**声明，不由容器宽度偶然决定。改之前 `.grid-metrics--pair` 是按容器宽度
 * auto-fit 的，于是同一对读数（可用余额 / 账户余额）在半宽卡里 2 列、换到整行卡就变 3 列 ——
 * 列数没有语义依据，用户看到的是「有些一行 2 个、有些一行 3 个」。
 *
 * 做成函数而不是让模板各自挑 class：变体名只在这里出现一次，加一个新变体不必 grep 十个组件。
 * 与 CSS 的对应关系见 `layout.css` 第 2 节。
 */
export function metricGridClass(count: number): string {
  if (count === 2) {
    return 'grid-metrics grid-metrics--2'
  }
  if (count === 3) {
    return 'grid-metrics grid-metrics--3'
  }
  // 1 个、4 个及以上：数量不定，交给 auto-fit 按可用宽度铺满
  return 'grid-metrics'
}

/**
 * 卡内 Key（账号）数是否已多到需要独占整行。
 *
 * 半宽单元格放不下两张账号卡，2 个 Key 会被挤成「一行一个 + 换行」，
 * 既浪费纵向空间又看不出是对等账号。达到阈值的区块由 App.vue 加 .grid-span-all，
 * 卡内 .grid-cards 随即排成两列。阈值取 2：**2 个 Key 就该并排**。
 */
export const MIN_ACCOUNTS_FOR_FULL_ROW = 2

export function shouldSpanFullRow(accountCount: number): boolean {
  return accountCount >= MIN_ACCOUNTS_FOR_FULL_ROW
}

/**
 * 平台名首字母（中文取拼音首字母，拉丁取首字母）。
 *
 * 为什么不用 `localeCompare(name, 'zh')` 直接比整个名字：ICU 的 zh 排序规则把
 * **全部拉丁字母排在汉字之后**，于是 `DeepSeek / OpenRouter` 会掉到「智谱 / 火山」后面，
 * 完全不像「按首字母排序」。这里把首字母单独抽出来比较，中英文平台就能混在
 * 同一个 A→Z 序列里（阿里 A · 百度 B · DeepSeek D · 模力 M · OpenRouter O · 智谱 Z）。
 *
 * 实现方式是对 23 个拼音首字母的锚点字做一次 zh 排序定位（拼音无 i/u/v 开头的音节，
 * 且 zh/ch/sh 分别归入 z/c/s），因此不需要引入任何拼音词典。
 */
const PINYIN_ANCHORS: ReadonlyArray<readonly [string, string]> = [
  ['A', '阿'],
  ['B', '芭'],
  ['C', '擦'],
  ['D', '搭'],
  ['E', '蛾'],
  ['F', '发'],
  ['G', '噶'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '啪'],
  ['Q', '七'],
  ['R', '然'],
  ['S', '撒'],
  ['T', '塌'],
  ['W', '挖'],
  ['X', '夕'],
  ['Y', '压'],
  ['Z', '匝'],
]

const PINYIN_COLLATOR = new Intl.Collator('zh-Hans-CN')

export function platformInitial(name: string): string {
  // 只看首字符：平台名首字符是汉字或拉丁字母，charAt 足够（无需按码点切分）
  const first = name.trim().charAt(0)
  if (/[a-z]/i.test(first)) {
    return first.toUpperCase()
  }
  for (let index = PINYIN_ANCHORS.length - 1; index >= 0; index -= 1) {
    const anchor = PINYIN_ANCHORS[index]
    if (anchor && PINYIN_COLLATOR.compare(anchor[1], first) <= 0) {
      return anchor[0]
    }
  }
  return '#'
}

/**
 * 平台卡片排序：**Key（账号）多的平台优先**；账号数相同时按平台名首字母 A→Z。
 *
 * 用户实测场景：OpenCode Go 挂了 3 个 Key、某平台 2 个、某平台 1 个
 * → 顺序应为 OpenCode Go、2 Key 平台、1 Key 平台；同 Key 数的再按首字母。
 * 末位以全名做兜底比较，保证输出与输入顺序无关（即排序结果稳定可断言）。
 */
export function comparePlatformSections(
  a: { name: string; count: number },
  b: { name: string; count: number },
): number {
  if (a.count !== b.count) {
    return b.count - a.count
  }
  const byInitial = platformInitial(a.name).localeCompare(platformInitial(b.name))
  if (byInitial !== 0) {
    return byInitial
  }
  return PINYIN_COLLATOR.compare(a.name, b.name)
}

export function sortPlatformSections<T extends { name: string; count: number }>(
  sections: readonly T[],
): T[] {
  return sections.toSorted(comparePlatformSections)
}

/**
 * 进度条状态：基于使用百分比映射 TDesign 桌面端 Progress status。
 * 桌面端 status 可选值 success/warning/error/active（无 danger）。
 */
export function progressStatus(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 90) {
    return 'error'
  }
  if (percent >= 70) {
    return 'warning'
  }
  return 'success'
}

/**
 * 按当前主题选出要展示的 Logo。
 *
 * 站点可以配两套 Logo（`SITE_LOGO_URL` 明亮 / `SITE_LOGO_URL_DARK` 暗黑）——
 * 深色字标落在深色导航上会糊成一片，这类「字标型」Logo 必须按主题换图。
 *
 * 取值是**有序回落**，不是「取一套、取不到就空白」：
 *   1. 当前主题那套（明亮模式取 `logoUrl`，暗黑模式取 `logoUrlDark`）；
 *   2. 另一套 —— 覆盖两种真实情况：暗色图**没配**（服务端不镜像，这里就是 null），
 *      或配了但**加载失败**（CDN 挂了 / 填错地址）；
 *   3. 都没有则返回 null，品牌位只显示站点名。
 * 回落到另一套而不是直接隐藏：暗色图缺失时，亮色图在深色底上虽然对比度差，
 * 但至少品牌位不空 —— 空掉是「功能消失」，发暗是「配置待补」，后者更容易被发现和修好。
 *
 * 宽度与高度由 `height` + `auto` 决定（见 layout.css 的 --app-logo-h），
 * 所以这里只需要给出一个 URL，不需要区分两套图的长宽比。
 */
export function pickLogoUrl(
  site: Pick<SiteConfig, 'logoUrl' | 'logoUrlDark'>,
  isDark: boolean,
  broken: ReadonlySet<string>,
): string | null {
  const candidates = isDark ? [site.logoUrlDark, site.logoUrl] : [site.logoUrl, site.logoUrlDark]
  return candidates.find((url) => url !== null && !broken.has(url)) ?? null
}
