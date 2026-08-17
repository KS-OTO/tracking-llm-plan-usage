/**
 * 多账号凭据读取工具。
 *
 * 约定：第 1 组使用基础变量名（如 DEEPSEEK_API_KEY），第 N 组使用 `_N` 后缀
 * （DEEPSEEK_API_KEY_2、DEEPSEEK_API_KEY_3…），按编号连续读取，遇到缺失即停。
 * 成对凭据（AccessKey + SecretKey）同编号成组。
 *
 * env 抽象兼容 Bun（process.env）/ Cloudflare Workers（binding）。
 */

export type EnvGetter = (key: string) => string | undefined

export interface KeyPair {
  key: string
  secret: string
}

function envOf(env?: EnvGetter): EnvGetter {
  if (env) {
    return env
  }
  return (key) => {
    const value = process.env[key]
    return value === undefined ? undefined : value
  }
}

/** 读取连续编号的单个 Key 列表。 */
export function readKeys(prefix: string, env?: EnvGetter): string[] {
  const get = envOf(env)
  const keys: string[] = []
  for (let i = 1; ; i++) {
    const name = i === 1 ? prefix : `${prefix}_${i}`
    const value = get(name)?.trim()
    if (!value) {
      break
    }
    keys.push(value)
  }
  return keys
}

/** 读取连续编号的 Key/Secret 成对凭据列表（不完整组跳过）。 */
export function readKeyPairs(keyPrefix: string, secretPrefix: string, env?: EnvGetter): KeyPair[] {
  const get = envOf(env)
  const pairs: KeyPair[] = []
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? '' : `_${i}`
    const key = get(`${keyPrefix}${suffix}`)?.trim()
    const secret = get(`${secretPrefix}${suffix}`)?.trim()
    if (!key && !secret) {
      break
    }
    if (key && secret) {
      pairs.push({ key, secret })
    }
  }
  return pairs
}

/**
 * 按编号前缀读取两组变量的配对映射（如 GITEE_AI_API_KEY ↔ GITEE_AI_SESSION_COOKIE）。
 * 两组序列独立连续编号：base 变量存在而对应 `_N` 缺失时，该组 value 为 undefined；
 * 两组同编号都缺失时停止。避免数组索引配对在序列缺口时错位。
 */
export function readPairedMap(
  keyPrefix: string,
  valuePrefix: string,
  env?: EnvGetter,
): Map<string, string> {
  const get = envOf(env)
  const map = new Map<string, string>()
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? '' : `_${i}`
    const key = get(`${keyPrefix}${suffix}`)?.trim()
    const value = get(`${valuePrefix}${suffix}`)?.trim()
    if (!key && !value) {
      break
    }
    if (key) {
      map.set(key, value ?? '')
    }
  }
  return map
}
