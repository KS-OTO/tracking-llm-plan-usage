/** 掩码展示密钥，仅保留首尾各 4 位。 */
export function maskKey(key: string): string {
  if (key.length <= 8) {
    return '****'
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

/** 金额展示，如 "12.34 CNY"。 */
export function formatMoney(value: number, currency: string): string {
  return `${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

/** Token 数量压缩展示：12.5K / 1.2M / 3.4B。 */
export function formatTokens(value: number): string {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`
  }
  return String(value)
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
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
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
