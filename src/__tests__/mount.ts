import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'
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
