import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'
import TDesign from 'tdesign-vue-next'
import { expect } from 'vite-plus/test'

/**
 * 组件契约测试的统一挂载器：注册 TDesign 全局组件，
 * 与生产入口 main.ts 的 createApp(App).use(TDesign) 保持一致。
 */
export function mountWithTDesign<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> = {},
) {
  return mount(component, {
    ...options,
    global: {
      plugins: [TDesign],
      ...options.global,
    },
  })
}

/**
 * 打开第 `index` 个「详情」弹窗，返回**弹窗内**的文本。
 *
 * TDesign Dialog 会 teleport 到 `attach`（默认 body），弹窗内容**不在** wrapper 里，
 * 因此这类断言必须直接读弹窗 DOM——这本身也印证了「低优先级字段已移出卡片」：
 * 同一段文案不会出现在 `wrapper.text()` 中。
 *
 * 每个用例都会留下一个未关闭的弹窗，读取前先清掉前序用例残留的弹窗上下文，
 * 否则跨用例的文案会互相污染断言。
 *
 * **顺带断言身份区两项都在**（`#20` 词汇表：别名 / Key）。放在这里而不是 10 个
 * Section 测试里各写一遍：「每个弹窗都有统一身份区」是一条不变量，断言写一次、
 * 10 个平台一起覆盖；某个适配器漏掉 `identityFields()` 时，任意一个弹窗用例当场失败。
 */
export async function openDetail(wrapper: VueWrapper, index = 0): Promise<string> {
  document.body.querySelectorAll('.t-dialog__ctx').forEach((node) => node.remove())

  const triggers = wrapper.findAll('.detail-trigger')
  const trigger = triggers[index]
  if (!trigger) {
    throw new Error(`第 ${index} 个「详情」按钮不存在（共 ${triggers.length} 个）`)
  }
  await trigger.trigger('click')
  await nextTick()
  await nextTick()

  const contexts = document.body.querySelectorAll('.t-dialog__ctx')
  const dialog = contexts[contexts.length - 1]
  const text = dialog?.textContent ?? ''
  // 身份区两项：全站统一叫法（别处叫「密钥名 / 用户名」的都并过来了）。
  // 不写自定义失败文案：vitest 的 valid-expect 规则只许 1 个参数。
  expect(text).toContain('别名')
  expect(text).toContain('Key')
  return text
}
