import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `src/` 目录。
 *
 * ⚠️ 不要写成 `new URL(\`../${name}\`, import.meta.url)`：Vite 对
 * `new URL(<相对路径>, import.meta.url)` 这个形状有专门的 asset 重写逻辑，
 * 参数是非字面量时会被改坏。先把 `import.meta.url` 转成路径再 `resolve`。
 *
 * 本文件在 `src/test-utils/` 下，所以往上走一层才是 `src/`。
 */
export const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** `dir` 下指定扩展名的全部文件（递归）。 */
export function sourceFiles(dir: string, extensions: readonly string[]): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full, extensions))
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      found.push(full)
    }
  }
  return found
}

/** `dir` 下全部 `.vue` 文件（递归）。 */
export function vueFiles(dir: string): string[] {
  return sourceFiles(dir, ['.vue'])
}
