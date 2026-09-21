/**
 * 品牌主题层的守卫（对应 `docs/design-baseline.md` 第 0.1 节）。
 *
 * 锁的不变量都有**静默失效**的失败方式 —— 改坏了不报错、类型检查也过，只有这里能抓：
 *
 * 1. **字面颜色只准出现在 `src/assets/theme.css`。**
 *    一旦有人在某个 `.vue` 的 `<style>` 里写死 `#0d51d9`，那个值就脱离了
 *    `:root[theme-mode='dark']` 的作用域 —— 亮色下看着对、暗色下仍是亮色主题的蓝，
 *    而且**不会报任何错**。这类漂移只有全量扫才有把握。
 *
 * 2. **`theme.css` 必须在 `main.ts` 里最后导入。**
 *    覆盖 TDesign 的 `:root` 变量靠的是「同特异性、后出现」，而 TDesign 的组件样式
 *    （各组件 `style/css.mjs`）是随 `./tdesign` 那个 import 才进模块图的。
 *    把 theme.css 提到前面去，构建不报错、类型检查不报错，只是**颜色不生效** ——
 *    排查成本极高。所以顺序必须被断言，而不是靠注释提醒。
 *
 * 3. **语义色必须钉在「消费级」上。** `--td-{success,warning,error}-color` 是别名，
 *    分别指向 `-5` / `-5` / `-6`，而进度条的填充色就是它们。钉错一级 → 条状图发闷，
 *    但**对比度、类型、渲染全都不报错**（上一版把亮绿钉在 `-8`，实际拿到 `#1c8b57`）。
 *
 * 4. **对比度是算出来的，不是看出来的。** 正文 4.5:1、非文字 3:1 在这里被逐条断言；
 *    品牌填充「既当填充又当文字」那个算术上无解的取舍，也把两头都钉死。
 */
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

import { SRC_DIR, sourceFiles } from './test-utils/src-files'

/** 唯一允许声明字面颜色的文件（相对于 `src/`）。 */
const THEME_FILE = 'assets/theme.css'

/** 匹配字面颜色：#abc / #aabbcc / #aabbccdd / rgb() / rgba() / hsl() / hsla() / 具名色。 */
const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(|\b(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|silver|navy|teal)\b/g

/** 把块注释按行数抹平（保留换行，行号才不漂）。 */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => '\n'.repeat(match.split('\n').length - 1))
}

/** 取 `.vue` 的 `<style>` 块；`.css` 取全文。返回带行号的 CSS 文本。 */
function cssWithLineNumbers(file: string): { line: number; text: string }[] {
  const raw = readFileSync(file, 'utf8')
  const blocks: { start: number; body: string }[] = []
  if (file.endsWith('.vue')) {
    const pattern = /<style[^>]*>([\s\S]*?)<\/style>/g
    for (const match of raw.matchAll(pattern)) {
      const body = match[1] ?? ''
      blocks.push({ start: raw.slice(0, match.index).split('\n').length, body })
    }
  } else {
    blocks.push({ start: 1, body: raw })
  }
  const rows: { line: number; text: string }[] = []
  for (const block of blocks) {
    const body = stripBlockComments(block.body)
    body.split('\n').forEach((text, index) => {
      rows.push({ line: block.start + index, text })
    })
  }
  return rows
}

/**
 * 在「已剥注释」的 CSS 文本里找出作为**声明值**出现的字面颜色。
 *
 * 必须只在冒号之后扫：直接扫整行会把**属性名**里的 `white` 也算命中
 * ——`white-space: nowrap` 实测报了 5 处假阳性（App.vue 与 layout.css 各若干），
 * 而 `white-space` 是本项目大量使用的换行控制属性。导出只为让回归用例直接喂样本。
 */
export function valueColorLiterals(css: string): { line: number; value: string }[] {
  const found: { line: number; value: string }[] = []
  css.split('\n').forEach((text, index) => {
    // 先按声明边界切开（`;` / `{` / `}`），每段只取第一个 `:` 之后的部分 = 值
    for (const segment of text.split(/[;{}]/)) {
      const colon = segment.indexOf(':')
      if (colon === -1) {
        continue
      }
      for (const match of segment.slice(colon + 1).matchAll(COLOR_LITERAL)) {
        found.push({ line: index + 1, value: match[0] })
      }
    }
  })
  return found
}

/** 找出文件里作为 CSS **声明值**出现的字面颜色。 */
function colorLiterals(file: string): string[] {
  const rows = cssWithLineNumbers(file)
    .map(({ text }) => text)
    .join('\n')
  return valueColorLiterals(rows).map(({ line, value }) => `${line}: ${value}`)
}

/** 取某个选择器块里的 `--x: value` 声明表。选择器要带 `{` 锚定，否则会被文件头注释命中。 */
function declarationsOf(selectorWithBrace: string): Map<string, string> {
  const css = readFileSync(resolve(SRC_DIR, THEME_FILE), 'utf8')
  const start = css.indexOf(selectorWithBrace)
  if (start === -1) {
    throw new Error(`theme.css 里找不到选择器块：${selectorWithBrace}`)
  }
  const open = css.indexOf('{', start)
  const end = css.indexOf('\n}', open)
  const map = new Map<string, string>()
  for (const raw of css.slice(open + 1, end).split('\n')) {
    // 行尾常有 `/* 4.99:1 实测值 */` 这类注释，先剥掉再取声明
    const line = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    const matched = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i.exec(line)
    // `noUncheckedIndexedAccess` 下正则捕获组是 `string | undefined`，逐个收窄
    const name = matched?.[1]
    const value = matched?.[2]
    if (name !== undefined && value !== undefined) {
      map.set(name, value.trim())
    }
  }
  return map
}

/** 把 `var(--x)` 解到同块内的字面值；已经是字面值就原样返回。 */
function resolveValue(decls: Map<string, string>, name: string): string {
  const raw = decls.get(name)
  if (raw === undefined) {
    throw new Error(`theme.css 里没有 ${name}`)
  }
  const target = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(raw)?.[1]
  return target === undefined ? raw : resolveValue(decls, target)
}

/** WCAG 2.x 相对亮度。 */
function luminance(hex: string): number {
  const digits = hex.replace('#', '')
  const channel = (offset: number): number => {
    const value = Number.parseInt(digits.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

function contrast(foreground: string, background: string): number {
  const front = luminance(foreground)
  const back = luminance(background)
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
}

/** 正文档位：这三档 + 链接色在本项目里都是**真实正文**，必须过 AA。 */
const TEXT_TIERS = [
  '--td-text-color-primary',
  '--td-text-color-secondary',
  '--td-text-color-placeholder',
  '--td-text-color-brand',
  '--td-text-color-link',
]

describe('品牌主题层', () => {
  it('扫值不扫属性名：white-space 不算颜色，color: white 才算', () => {
    const css = [
      '.a {',
      '  white-space: nowrap;',
      '  background: white;',
      '  color: #0d51d9;',
      '  border-color: rgba(0, 0, 0, 0.1);',
      '}',
    ].join('\n')
    expect(valueColorLiterals(css)).toEqual([
      { line: 3, value: 'white' },
      { line: 4, value: '#0d51d9' },
      { line: 5, value: 'rgba(' },
    ])
  })

  // 这两条是 2026-09-21 实际踩出来的：`--td-text-color-brand` 原本指 `var(--td-brand-color)`
  // （填充档），亮色侥幸 6.57:1、**暗色只有 2.15:1**，而所有门禁全绿。只有算对比度能抓。
  it.each([
    ['亮色', ":root[theme-mode='light'] {"],
    ['暗色', ":root[theme-mode='dark'] {"],
  ])('%s：正文档位在容器面上都过 AA（≥4.5:1）', (label, selector) => {
    const decls = declarationsOf(selector)
    const container = resolveValue(decls, '--td-bg-color-container')
    for (const tier of TEXT_TIERS) {
      const value = resolveValue(decls, tier)
      const ratio = contrast(value, container)
      expect(
        ratio,
        `${label} ${tier}=${value} on 容器面 ${container} 只有 ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * 品牌填充上的反白字。
   *
   * 亮色侧 `#0d51d9` 上有 6.57:1，达标。**暗色侧实测 3.70:1**（TDesign 官方暗色同位置是
   * 3.76:1）—— 这不是漏改，是算术上无解逼出来的取舍（见 `theme.css` 文件头「暗色为什么
   * 换了个蓝」）：TDesign 把 `--td-brand-color` 同时当填充和文字，白字压它要求亮度
   * ≤0.183、它当字压卡片面要求亮度 ≥0.231，同一个色满足不了。所以这里把**权衡本身**
   * 钉死：暗色必须「填充上白字 ≥3.6」且「它当字压卡片面 ≥4.5」，任何一头被改坏都会红。
   *
   * 下限取 3.6 而不是实测的 3.70，是留一点浮动余量（3.6997 这种浮点尾数不该判红）。
   */
  it.each([
    ['亮色', ":root[theme-mode='light'] {", '--td-brand-color-7', 4.5],
    ['暗色', ":root[theme-mode='dark'] {", '--td-brand-color-8', 3.6],
  ])('%s：压在品牌填充上的反白字不低于约定下限', (label, selector, fillStep, floor) => {
    const decls = declarationsOf(selector)
    const foreground = resolveValue(decls, '--td-text-color-anti')
    const background = resolveValue(decls, fillStep)
    const ratio = contrast(foreground, background)
    expect(
      ratio,
      `${label} ${foreground} on ${fillStep}=${background} 只有 ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(floor)
  })

  // 上一条的另一半：品牌填充色**当文字**时（`.t-button--variant-text.theme-primary`
  // 的「详情」按钮就压卡片面）也必须过 AA。参考站的 `#0d51d9` 在这里只有 2.15:1，
  // 所以暗色换成了 `#4e7ef9`；这条锁住「不许换回去」。
  it.each([
    ['亮色', ":root[theme-mode='light'] {", '--td-brand-color-7'],
    ['暗色', ":root[theme-mode='dark'] {", '--td-brand-color-8'],
  ])('%s：品牌填充色当文字压在容器面上过 AA', (label, selector, fillStep) => {
    const decls = declarationsOf(selector)
    const container = resolveValue(decls, '--td-bg-color-container')
    const fill = resolveValue(decls, fillStep)
    const ratio = contrast(fill, container)
    expect(
      ratio,
      `${label} ${fillStep}=${fill} 当字压在 ${container} 上只有 ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * 进度条的填充色必须**亮**（用户点名「条状图尽量用亮色」）。
   *
   * 这条是上一版的回归守卫：`--td-{success,warning,error}-color` 是**别名**，
   * 分别指向 `-5` / `-5` / `-6`（实测 `es/style/index.css`），而 `.t-progress__inner`
   * 的填充色就是它们。上一版把 `#21e786` 钉在 `-8`，于是进度条实际拿到 `#1c8b57`
   * —— 一个发闷的中绿，而当时**所有门禁都是绿的**。
   *
   * 用「对容器面 ≥4.5」当亮度的代理指标：深底上的亮绿是 10.29:1，那个发闷的
   * `#1c8b57` 只有 3.91:1 —— 会红。再加一条「对轨道 ≥3」保证条本身看得出来。
   */
  it.each([
    ['亮色', ":root[theme-mode='light'] {"],
    ['暗色', ":root[theme-mode='dark'] {"],
  ])('%s：进度条填充（语义色消费级）是亮色且看得出', (label, selector) => {
    const decls = declarationsOf(selector)
    const container = resolveValue(decls, '--td-bg-color-container')
    const track = resolveValue(decls, '--td-bg-color-component')
    // 别名实际指向的级别 —— 写死在这里，就是为了让「钉错级」这件事被测到
    const fills = [
      ['success', '--td-success-color-5'],
      ['warning', '--td-warning-color-5'],
      ['error', '--td-error-color-6'],
    ] as const
    for (const [name, token] of fills) {
      const fill = resolveValue(decls, token)
      const onContainer = contrast(fill, container)
      const onTrack = contrast(fill, track)
      expect(
        onContainer,
        `${label} ${name} ${token}=${fill} 压容器面 ${container} 只有 ${onContainer.toFixed(2)}:1 —— 不够亮（发闷的填充约 3.9:1）`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        onTrack,
        `${label} ${name} ${token}=${fill} 压轨道 ${track} 只有 ${onTrack.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('圆角是阶梯：大卡必须明显比按钮圆（medium ≥ 3× default）', () => {
    const decls = declarationsOf(':root {')
    const medium = Number.parseFloat(resolveValue(decls, '--td-radius-medium'))
    const base = Number.parseFloat(resolveValue(decls, '--td-radius-default'))
    expect(Number.isFinite(medium) && Number.isFinite(base)).toBe(true)
    expect(
      medium,
      `大卡 ${medium}px / 按钮 ${base}px —— 被一刀切成同一个值了`,
    ).toBeGreaterThanOrEqual(base * 3)
    // round / circle 必须还是圆的，被顺手改成 2px 会变成坏掉而不是锐利
    expect(resolveValue(decls, '--td-radius-round')).not.toBe('2px')
    expect(resolveValue(decls, '--td-radius-circle')).toBe('50%')
  })

  // 暗色卡片的明暗方向。参考站的内容面板是**纯黑、比页面更深**，本项目刻意做成
  // 比页面**浅**（理由见 theme.css 偏离第 1 条）。这条把那个决定钉住：方向被改回去时
  // 必须同步改文档，而不是悄悄漂移。
  it('暗色：卡片比页面浅（刻意的结构偏离，见 theme.css 偏离第 1 条）', () => {
    const decls = declarationsOf(":root[theme-mode='dark'] {")
    const page = resolveValue(decls, '--td-bg-color-page')
    const container = resolveValue(decls, '--td-bg-color-container')
    expect(
      luminance(container),
      `卡片 ${container} 应比页面 ${page} 浅（亮度应更大）`,
    ).toBeGreaterThan(luminance(page))
  })

  /**
   * 填充档 token 不得当**前景色**用 —— 对应 `theme.css` 文件头「文字色不许取填充色 token」。
   *
   * `--td-brand-color` 在亮色是 `-7`、暗色是 `-8`，后者是给「上面压白字的色块」选的。
   * 本项目 `layout.css` 两处链接原本就这么写：亮色 6.57:1 侥幸可读、**暗色掉到 2.15:1**，
   * 而当时所有门禁都是绿的 —— 所以这条只能靠静态规则锁。
   *
   * 只锁「前景」属性：`background` / `border` 那类**本来就该**用填充档，不在范围内；
   * 色阶的**某一级**（`--td-brand-color-7`）也允许，禁的是不带级别的那几个。
   */
  it('前景色属性不得直接引用填充档 token', () => {
    const foreground = new Set(['color', 'text-decoration-color', 'caret-color', 'fill', 'stroke'])
    const fillToken = /var\(\s*--td-(?:brand|success|warning|error)-color\s*\)/

    const offenders: string[] = []
    for (const file of sourceFiles(SRC_DIR, ['.vue', '.css'])) {
      const name = relative(SRC_DIR, file).replaceAll('\\', '/')
      if (name === THEME_FILE) {
        continue
      }
      for (const { line, text } of cssWithLineNumbers(file)) {
        for (const segment of text.replace(/\/\*[\s\S]*?\*\//g, '').split(/[;{}]/)) {
          const colon = segment.indexOf(':')
          if (colon === -1) {
            continue
          }
          const property = segment.slice(0, colon).trim().toLowerCase()
          if (foreground.has(property) && fillToken.test(segment.slice(colon + 1))) {
            offenders.push(`${name} → ${line}: ${property} 用了填充档 token`)
          }
        }
      }
    }

    expect(offenders, '这些前景色应当改指 --td-text-color-*').toEqual([])
  })

  it('字面颜色只出现在 theme.css，组件与其它样式表一律走 var(--td-*)', () => {
    const files = sourceFiles(SRC_DIR, ['.vue', '.css'])
    expect(files.length).toBeGreaterThan(20)

    const offenders: string[] = []
    for (const file of files) {
      const name = relative(SRC_DIR, file).replaceAll('\\', '/')
      if (name === THEME_FILE) {
        continue
      }
      for (const hit of colorLiterals(file)) {
        offenders.push(`${name} → ${hit}`)
      }
    }

    // 失败时直接给出「文件 → 行号: 值」，不用再去猜是哪一处
    expect(offenders, `这些字面颜色应当改写成 theme.css 里的语义 token`).toEqual([])
  })

  it('theme.css 自己在亮暗两套下都给了品牌色阶', () => {
    const css = readFileSync(resolve(SRC_DIR, THEME_FILE), 'utf8')
    // 亮色块与暗色块必须**分别**重新定义阶，只写一套会让另一套落回 TDesign 的蓝
    for (const selector of [":root,\n:root[theme-mode='light']", ":root[theme-mode='dark']"]) {
      expect(css, `theme.css 缺少 ${selector} 块`).toContain(selector)
    }
    expect(css.match(/--td-brand-color-7:/g)?.length).toBe(2)
    expect(css.match(/--td-brand-color-8:/g)?.length).toBe(2)
  })

  it('main.ts 最后导入 theme.css（覆盖靠后出现的同特异性规则）', () => {
    const main = readFileSync(resolve(SRC_DIR, 'main.ts'), 'utf8')
    const themeAt = main.indexOf("import './assets/theme.css'")
    const tdesignComponentAt = main.indexOf("from './tdesign'")
    const tdesignStyleAt = main.indexOf("import 'tdesign-vue-next/es/style/index.css'")

    expect(themeAt, 'main.ts 没有导入 theme.css').toBeGreaterThan(-1)
    expect(tdesignComponentAt, 'main.ts 没有导入 ./tdesign').toBeGreaterThan(-1)
    expect(tdesignStyleAt, 'main.ts 没有导入 TDesign 样式').toBeGreaterThan(-1)
    // 关键：晚于 ./tdesign —— 各组件样式是随它进模块图的
    expect(themeAt).toBeGreaterThan(tdesignComponentAt)
    expect(themeAt).toBeGreaterThan(tdesignStyleAt)
  })
})
