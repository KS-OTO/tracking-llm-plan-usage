import { expect, test } from '@playwright/test'
import { z } from 'zod'

/**
 * E2E 冒烟（Seam C）：无任何 provider key 的 vp dev 上验证
 * 接口连通、空态渲染、响应式重排、暗色切换、回到顶部。
 */
test.describe('dashboard smoke', () => {
  test('api status returns 200 and providers report unconfigured', async ({ request }) => {
    const res = await request.get('/api/status')
    expect(res.status()).toBe(200)
    const body = z
      .object({
        providers: z.record(z.string(), z.object({ configured: z.boolean(), count: z.number() })),
      })
      .parse(await res.json())
    for (const provider of Object.values(body.providers)) {
      expect(provider.configured).toBe(false)
      expect(provider.count).toBe(0)
    }
  })

  test('deepseek endpoint reports NOT_CONFIGURED without erroring out', async ({ request }) => {
    const res = await request.get('/api/deepseek/balance')
    expect(res.status()).toBe(503)
    const body = z.object({ error: z.object({ code: z.string() }) }).parse(await res.json())
    expect(body.error.code).toBe('NOT_CONFIGURED')
  })

  test('overview is the default tab with alert, reset and nav cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('套餐订阅')).toBeVisible()
    await expect(page.getByText('额度预警')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('最近重置')).toBeVisible()
    await expect(page.getByText('平台导航（点击直达）')).toBeVisible()
    // 无密钥密封环境：展示未配置空态而非错误墙
    await expect(page.getByText('未配置任何平台密钥').first()).toBeVisible()
  })

  test('nav card click jumps to anchored section in the right tab', async () => {
    test.skip(true, 'needs configured providers; hermetic env has no nav cards')
  })

  test('page renders header, tabs and empty states without crashing', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('LLM 用量监控', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('套餐订阅')).toBeVisible()
    // 默认总览 Tab；切到套餐订阅验证区块空态
    await page.locator('.t-menu__item', { hasText: '套餐订阅' }).click()
    // 未配置密钥 → 区块展示未配置提示（VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY）
    await expect(page.getByText('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY').first()).toBeVisible(
      { timeout: 30_000 },
    )
  })
  test('tab switching exposes balance sections', async ({ page }) => {
    await page.goto('/')
    await page.locator('.t-menu__item', { hasText: '余额账户' }).click()
    await expect(page.getByText('未配置 DEEPSEEK_API_KEY')).toBeVisible({ timeout: 30_000 })
  })

  test('dark mode toggle switches root theme attribute and persists', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).not.toHaveAttribute('theme-mode', 'dark')

    await page.getByRole('button', { name: '切换为深色模式' }).click()
    await expect(html).toHaveAttribute('theme-mode', 'dark')

    await page.reload()
    await expect(html).toHaveAttribute('theme-mode', 'dark')

    // 切回浅色，避免污染后续用例的 localStorage
    await page.getByRole('button', { name: '切换为浅色模式' }).click()
    await expect(html).not.toHaveAttribute('theme-mode', 'dark')
  })

  test('responsive: subscription grid reflows between desktop and mobile', async ({ page }) => {
    await page.goto('/')
    await page.locator('.t-menu__item', { hasText: '套餐订阅' }).click()
    await expect(page.getByText('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY').first()).toBeVisible(
      { timeout: 30_000 },
    )

    // 桌面（≥992px）：区块卡片渲染（限定可见面板，v-show 隐藏面板的卡片不算）
    await page.setViewportSize({ width: 1440, height: 900 })
    const cards = page.locator('.t-card:visible')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    const desktopCount = await cards.count()
    expect(desktopCount).toBeGreaterThan(0)

    // 手机（<768px）：单列布局，页面仍可用
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.getByText('LLM 用量监控', { exact: true }).first()).toBeVisible()
  })

  test('back-to-top appears after scrolling and returns to top', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.locator('.t-menu__item', { hasText: '套餐订阅' }).click()
    await expect(page.getByText('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY').first()).toBeVisible(
      { timeout: 30_000 },
    )
    await page.mouse.wheel(0, 2000)
    const backTop = page.locator('.t-back-top')
    await expect(backTop).toBeVisible({ timeout: 10_000 })
    await backTop.click()
    // 回顶后按钮消失
    await expect(backTop).toBeHidden({ timeout: 10_000 })
  })
})
