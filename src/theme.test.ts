/**
 * 品牌主题层的守卫（对应 `docs/design-baseline.md` 第 0.1 节）。
 *
 * 锁两条不变量，两条都有**静默失效**的失败方式，靠人眼 review 是抓不住的：
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

  // 顺带把「anchor 落在第几级」这个契约也钉住（亮 -7 / 暗 -8，见文件头实测表）
  it.each([
    ['亮色', ":root[theme-mode='light'] {", '--td-brand-color-7'],
    ['暗色', ":root[theme-mode='dark'] {", '--td-brand-color-8'],
  ])('%s：压在品牌填充上的反白字过 AA', (label, selector, fillStep) => {
    const decls = declarationsOf(selector)
    const foreground = resolveValue(decls, '--td-text-color-anti')
    const background = resolveValue(decls, fillStep)
    const ratio = contrast(foreground, background)
    expect(
      ratio,
      `${label} ${foreground} on ${fillStep}=${background} 只有 ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5)
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
