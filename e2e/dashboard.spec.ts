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

  test('aliyun token plan endpoint reports NOT_CONFIGURED without erroring out', async ({
    request,
  }) => {
    const res = await request.get('/api/aliyun/tokenplan')
    expect(res.status()).toBe(503)
    const body = z.object({ error: z.object({ code: z.string() }) }).parse(await res.json())
    expect(body.error.code).toBe('NOT_CONFIGURED')
  })

  test('subscription tab hosts the plan-type credentials (OpenCode Go)', async ({ page }) => {
    await page.goto('/')
    await page.locator('.t-menu__item', { hasText: '套餐订阅' }).click()
    await expect(page.getByText('未配置订阅套餐密钥').first()).toBeVisible({ timeout: 30_000 })
    await expect(
      page
        .locator('#anchor-plans')
        .getByText(/OPENCODE_GO/)
        .first(),
    ).toBeVisible()
  })

  test('扩展平台 Tab 已移除，余额账户直接给出 OpenRouter', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.t-menu__item', { hasText: '扩展平台' })).toHaveCount(0)

    await page.locator('.t-menu__item', { hasText: '余额账户' }).click()
    await expect(page.locator('#anchor-openrouter')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#anchor-extras')).toHaveCount(0)
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

  /**
   * 布局回归：卡片宽度只能由 assets/layout.css 的网格原语决定。
   * 断言的是「不变量」而不是具体像素值，因此对断点调整保持鲁棒。
   *
   * 锁定两个历史 bug：
   * 1) .app-main 用 `margin:0 auto` 在 t-layout（flex column）下压过了 align-items:stretch，
   *    主容器退化为「按内容收缩」——1440 视口实测仅 1046px，内层网格随之整体塌陷
   *    （扩展平台卡片只剩 232px）。修复：显式 width:100%。
   * 2) 早期用 t-row/t-col 按 24 列书写，而 TDesign 栅格是 12 列，所有断点错位一倍，
   *    同一屏里同时出现满宽卡 / 2-3 卡 / 2 卡，且同排卡片宽度对不齐。
   */
  test('responsive: shell fills viewport and same-row cards share one width', async ({ page }) => {
    await page.goto('/')
    await page.locator('.t-menu__item', { hasText: '套餐订阅' }).click()
    await expect(page.getByText('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY').first()).toBeVisible(
      { timeout: 30_000 },
    )

    const shell = page.locator('.app-main')
    /**
     * 可见网格单元的取整宽度（v-show 隐藏面板里的元素 offsetParent 为 null，需排除）。
     * `.grid-span-all` 单元被设计成独占整行（多 Key 卡），宽度天然等于整行，不参与「等宽」比较。
     */
    const cellWidths = (): Promise<number[]> =>
      page.$$eval<number[], HTMLElement>('.grid-sections > *:not(.grid-span-all)', (nodes) =>
        nodes
          .filter((node) => node.offsetParent !== null)
          .map((node) => Math.round(node.getBoundingClientRect().width)),
      )
    const shellWidth = async (): Promise<number> =>
      Math.round((await shell.boundingBox())?.width ?? 0)

    // 桌面 1440：外壳撑满视口（未被内容宽度收缩），同 Tab 内区块卡一律等宽
    await page.setViewportSize({ width: 1440, height: 900 })
    expect(await shellWidth()).toBe(1440)
    const desktop = await cellWidths()
    expect(desktop.length).toBeGreaterThan(1)
    expect(new Set(desktop).size).toBe(1)

    // 总览 Tab 曾是同排不等宽的重灾区（旧写 `:lg="10"` / `:lg="7"` / `:lg="7"`
    // 在 12 列栅格下等于 83% / 58% / 58%），单独锁一遍
    await page.locator('.t-menu__item', { hasText: '总览' }).click()
    await expect(page.getByText('平台导航（点击直达）')).toBeVisible({ timeout: 30_000 })
    const overview = await cellWidths()
    expect(overview.length).toBe(3)
    expect(new Set(overview).size).toBe(1)

    // 平板 1024：两列，仍然等宽
    await page.locator('.t-menu__item', { hasText: '套餐订阅' }).click()
    await expect(
      page.getByText('未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY').first(),
    ).toBeVisible()
    await page.setViewportSize({ width: 1024, height: 900 })
    const tablet = await cellWidths()
    expect(new Set(tablet).size).toBe(1)

    // 手机 375：单列，卡片必须撑满容器内容宽（视口减去左右 24px 内边距）
    await page.setViewportSize({ width: 375, height: 667 })
    expect(await shellWidth()).toBe(375)
    await expect(page.getByText('LLM 用量监控', { exact: true }).first()).toBeVisible()
    const mobile = await cellWidths()
    expect(new Set(mobile).size).toBe(1)
    expect(mobile[0]).toBe(375 - 2 * 24)
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
