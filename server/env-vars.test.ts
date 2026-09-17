import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vite-plus/test'

import { HOST_LOCAL_ENV_VARS, isKnownEnvVar, SERVER_ENV_VARS } from './env-vars.ts'

/**
 * 仓库根目录（本文件在 `server/` 下，向上一级）。
 *
 * ⚠️ **不要写成 `new URL(\`../${name}\`, import.meta.url)`**：Vite 对
 * `new URL(<相对路径>, import.meta.url)` 这个形状有专门的 asset 重写逻辑，参数是
 * 非字面量时会被改坏 —— 实测解析出 `D:\...\server\undefined` 而不是仓库根。
 * 先把 `import.meta.url` 转成路径再 `resolve`，完全绕开这个模式。
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 为什么用测试来管文档：`.env.example` / `.dev.vars.example` / `.env` 三份文件是**手抄**
 * 同一个变量集合，抄着抄着就漂了 —— 实测 `.env.example` 曾漏掉整个 `BAIDU_*`（百度千帆），
 * 而 `.dev.vars.example` 没有 `SITE_*` 的启用行。这类缺失不会让任何测试失败，
 * 只会在用户照着文档配完、发现某个平台死活不出现时才暴露。
 *
 * 这里把「文档必须覆盖代码读取的变量全集」变成一条断言，漂移当场就会被挡住。
 */

/** 示例文件里「已登记」的变量名 —— 注释形式（`# KEY=`）也算，按出现顺序返回。 */
function registeredVars(fileName: string): string[] {
  const text = readFileSync(resolve(REPO_ROOT, fileName), 'utf8')
  const found: string[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)
    if (match?.[1] !== undefined && !found.includes(match[1])) {
      found.push(match[1])
    }
  }
  return found
}

/** 值里有没有「像真凭据」的长随机串（示例文件里混进真密钥时会被这条抓到）。 */
function suspiciousValues(fileName: string): string[] {
  const text = readFileSync(resolve(REPO_ROOT, fileName), 'utf8')
  const bad: string[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line)
    if (match?.[1] === undefined || match[2] === undefined) {
      continue
    }
    const value = match[2].trim()
    // 24 位以上的纯 base64/hex 字符集，且不含占位符痕迹（尖括号、中文、空格）
    if (value.length >= 24 && /^[A-Za-z0-9+/=._-]+$/.test(value)) {
      bad.push(`${match[1]}=${value}`)
    }
  }
  return bad
}

describe('SERVER_ENV_VARS', () => {
  it('没有重复登记（重复会让密封环境的置空循环做无用功）', () => {
    expect(new Set(SERVER_ENV_VARS).size).toBe(SERVER_ENV_VARS.length)
  })

  it('变量名都是大写下划线风格（env 读取不做大小写折叠）', () => {
    for (const name of SERVER_ENV_VARS) {
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })
})

/**
 * 对一个示例文件跑同一组断言。
 *
 * 为什么不用 `for (const file of EXAMPLES) { describe(file, …) }`：vitest 的
 * `valid-title` 规则要求 describe 的标题是**字符串字面量**（动态标题在 reporter 里
 * 无法静态展开），所以两个文件各写一个字面量 describe，共用这里的断言体。
 */
function checkExample(file: string): void {
  it('覆盖了 SERVER_ENV_VARS 登记的全部变量', () => {
    const missing = SERVER_ENV_VARS.filter((name) => !registeredVars(file).includes(name))
    expect(missing).toStrictEqual([])
  })

  it('没有登记代码不认识的变量（防止删掉平台后文档留僵尸条目）', () => {
    const unknown = registeredVars(file).filter(
      (name) => !isKnownEnvVar(name) && !name.endsWith('_LABEL'),
    )
    expect(unknown).toStrictEqual([])
  })

  it('值里没有看起来像真凭据的长随机串', () => {
    expect(suspiciousValues(file)).toStrictEqual([])
  })
}

describe('环境变量示例文档', () => {
  describe('.env.example', () => {
    checkExample('.env.example')
  })

  describe('.dev.vars.example', () => {
    checkExample('.dev.vars.example')
  })

  it('两份示例的变量集合一致（差集只能是宿主专属项）', () => {
    const a = new Set(registeredVars('.env.example'))
    const b = new Set(registeredVars('.dev.vars.example'))
    const onlyInEnvExample = [...a].filter((name) => !b.has(name))
    const onlyInDevVars = [...b].filter((name) => !a.has(name))
    const allowed = new Set<string>(HOST_LOCAL_ENV_VARS)
    expect(
      onlyInEnvExample.filter((name) => !allowed.has(name)),
      '.env.example 独有（非宿主专属）',
    ).toStrictEqual([])
    expect(onlyInDevVars, '.dev.vars.example 独有').toStrictEqual([])
  })

  it('两份示例的变量顺序一致（同构，便于逐行对照）', () => {
    const a = registeredVars('.env.example').filter((n) => !HOST_LOCAL_ENV_VARS.includes(n))
    const b = registeredVars('.dev.vars.example').filter((n) => !HOST_LOCAL_ENV_VARS.includes(n))
    expect(a).toStrictEqual(b)
  })
})
