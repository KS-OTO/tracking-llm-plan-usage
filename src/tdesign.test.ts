import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { createApp, type App } from 'vue'
import { describe, expect, it } from 'vite-plus/test'

import { SRC_DIR, sourceFiles, vueFiles } from './test-utils/src-files'
import { TDESIGN_COMPONENTS, TDesignComponents } from './tdesign'

/**
 * Vue 解析标签时（`resolveAsset`）会对一个名字依次尝试三种写法。
 * 例如 `t-descriptions-item` → `tDescriptionsItem` → `TDescriptionsItem`，
 * 而 TDesign 注册的是最后那个。
 */
function candidateNames(tag: string): readonly string[] {
  const pascal = tag
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return [tag, pascal.charAt(0).toLowerCase() + pascal.slice(1), pascal]
}

/**
 * 该标签在本注册表下能否解析到。
 *
 * 不能写成 `app.component(tag)`：那个 getter **只按键精确查找、不做归一化**，
 * 而 `<t-alert>` 实际注册成的是 `TAlert`。
 */
function resolves(app: App, tag: string): boolean {
  return candidateNames(tag).some((name) => Boolean(app.component(name)))
}

/**
 * 模板里出现的全部 `<t-*>` 标签（去重、排序）。
 *
 * 用 `match(/g)` + `for…of` 而不是 `matchAll` + 下标：后者在
 * `noUncheckedIndexedAccess` 下每个下标都是 `string | undefined`，
 * 而 `for…of` 拿到的是确定的 `string`。
 */
function tdesignTags(files: readonly string[]): string[] {
  const found = new Set<string>()
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').match(/<t-[a-z0-9-]+/g) ?? []) {
      found.add(match.slice(1))
    }
  }
  return [...found].toSorted()
}

/**
 * 整库默认导入。锚在行首（只允许前导空白）是有意的：文档注释里会**成段讨论**
 * 这个写法（`src/tdesign.ts` 开头就是），不锚行首会把散文当成代码命中。
 */
const FULL_LIBRARY_IMPORT = /^\s*import\s+TDesign\s+from\s/m

/**
 * TDesign 注册表守卫（`src/tdesign.ts`）。
 *
 * 为什么必须用测试管：漏注册**不会让任何东西变红**。生产上 Vue 把一个解析不到的
 * 标签当成未解析的自定义元素静默渲染 —— 没有内容、没有报错，只是那块 UI 空了；
 * 而类型检查、构建、E2E 全都照过。这类「静默降级」只能靠静态扫描 + 注册表自证兜住。
 *
 * 与 `format.test.ts` 的数值精度守卫、`server/env-vars.test.ts` 的文档漂移守卫同一手法。
 */
describe('TDesign 注册表（守卫）', () => {
  const files = vueFiles(SRC_DIR)

  it('扫到了模板文件（守卫本身不能是空转的）', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('模板里的每个 <t-*> 标签都能在本注册表下解析到', () => {
    const app = createApp({})
    app.use(TDesignComponents)

    const tags = tdesignTags(files)
    // 先说清扫描确实扫到了东西：全部标签都消失时这条守卫必须失败，而不是「零违规」通过
    expect(tags.length).toBeGreaterThan(10)

    const missing = tags.filter((tag) => !resolves(app, tag))
    // 失败时给的是缺失清单，直接补进 TDESIGN_COMPONENTS 即可
    expect(missing).toStrictEqual([])
  })

  it('入口没有回落到整库默认导出（它不可摇树，实测多 287 KB gzip）', () => {
    const offenders = sourceFiles(SRC_DIR, ['.ts', '.vue'])
      .filter((file) => FULL_LIBRARY_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_DIR, file).replaceAll('\\', '/'))
    expect(offenders).toStrictEqual([])
  })

  it('注册表里没有重复项（同一组件注册两次是纯浪费）', () => {
    expect(new Set(TDESIGN_COMPONENTS).size).toBe(TDESIGN_COMPONENTS.length)
  })
})
