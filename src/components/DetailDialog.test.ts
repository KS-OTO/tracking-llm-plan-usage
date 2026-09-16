import { describe, expect, it } from 'vite-plus/test'
import { nextTick } from 'vue'

import DetailDialog from './DetailDialog.vue'
import { mountWithTDesign } from '../test-utils/mount'

/**
 * 弹窗几何的回归断言。
 *
 * 防的是同一个缺陷：TDesign Dialog 的默认 placement 是 `'top'`，对应
 * `.t-dialog__position.t-dialog--top { align-items: flex-start; padding-top: 20vh }`
 * —— 弹窗顶边被钉在**视口高度的 20%** 处，并不是相对屏幕居中
 * （实测 1440×1000 顶距 200px、1440×800 → 160px，两次都恰好 20vh）。
 * 而且这段留白在**外层** `.t-dialog__position` 的 padding 上，不在 `.t-dialog` 上，
 * 所以给弹窗自身写 align-self / margin 一律无效，只能由 `placement="center"` 解决。
 *
 * 高度封顶 / 宽度兜底那两条在 assets/layout.css 第 5 节（CSS 断言留给 e2e 与实机量测），
 * 这里只钉住「居中方式」这个纯配置项，它恰恰是最容易被顺手删掉的一行。
 */
async function openDialog() {
  document.body.querySelectorAll('.t-dialog__ctx').forEach((node) => node.remove())

  const wrapper = mountWithTDesign(DetailDialog, {
    props: { title: 'OpenCode Go', subtitle: 'sk-1****go' },
    slots: { default: '弹窗内容' },
  })
  await wrapper.find('.detail-trigger').trigger('click')
  await nextTick()
  await nextTick()

  return wrapper
}

describe('DetailDialog', () => {
  it('居中方式用 placement="center"，而不是 TDesign 默认的 top(20vh)', async () => {
    await openDialog()

    const position = document.body.querySelector('.t-dialog__position')
    // 默认的 'top' 会落成 t-dialog--top（20vh 顶距），屏上表现为「吊在屏幕上方」
    expect(position?.className).toContain('t-dialog--center')
    expect(position?.className).not.toContain('t-dialog--top')
  })

  it('标题与 Key 掩码渲染在 teleport 出来的弹窗里（不在卡片内）', async () => {
    await openDialog()

    const ctx = document.body.querySelector('.t-dialog__ctx')
    expect(ctx?.textContent).toContain('OpenCode Go')
    expect(ctx?.textContent).toContain('sk-1****go')
    expect(ctx?.textContent).toContain('弹窗内容')
  })
})
