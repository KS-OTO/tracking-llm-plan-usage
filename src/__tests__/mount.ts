import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'
import TDesign from 'tdesign-vue-next'

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
  return dialog?.textContent ?? ''
}
