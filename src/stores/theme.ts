/**
 * 主题 store：TDesign 桌面端通过根元素 `theme-mode` 属性切换（:root[theme-mode='dark']）。
 *
 * - 初始化优先读取 localStorage，其次跟随系统 prefers-color-scheme
 * - 切换后写入 localStorage 并同步到 <html>
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'llm-usage-theme'

function readInitialTheme(): ThemeMode {
  // 隐私模式/沙箱 iframe 中 localStorage 可能抛 SecurityError，降级到系统偏好
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readInitialTheme())
  const isDark = computed(() => mode.value === 'dark')

  watch(
    mode,
    (value) => {
      document.documentElement.setAttribute('theme-mode', value)
      try {
        localStorage.setItem(STORAGE_KEY, value)
      } catch {
        // 存储被禁用时仅丢失偏好持久化，不影响当次会话
      }
    },
    { immediate: true },
  )

  function toggle(): void {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  return { mode, isDark, toggle }
})
