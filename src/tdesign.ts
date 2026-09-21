/**
 * TDesign 组件**显式注册表** —— 前端唯一的组件注册入口（`main.ts` 与测试挂载器共用）。
 *
 * ## 为什么不 `app.use(TDesign)`
 *
 * 整库默认导出的 `install` 是「遍历全部 77 个组件逐个 `app.use`」，于是**没有任何摇树余地**
 * （它的实现与 `src/tdesign.ts` 下面那段循环逐字等价，只是组件表不同）。
 * 同一份代码只换这一处导入，`bun run build` 实测（「改前」= `main` 原状，「改后」= 本分支，
 * 两者之间还夹着「客户端去掉 zod」那一项）：
 *
 * | 产物（入口）     | 改前（`main`）            | 改后                     | 差              |
 * | ---------------- | ------------------------- | ------------------------ | --------------- |
 * | JS               | 1464.8 KB / 391.1 KB gzip | 794.3 KB / 225.8 KB gzip | −45.8% / −42.3% |
 * | CSS              | 453.2 KB / 52.7 KB gzip   | 224.6 KB / 27.3 KB gzip  | −50.4% / −48.2% |
 * | JS+CSS gzip 合计 | 443.9 KB                  | 253.1 KB                 | **−43.0%**      |
 *
 * 归因：客户端去 zod 单独只值 JS gzip −24.1 KB（391.1 → 367.1 KB），剩下四十来 KB 全是这里省的。
 *
 * **CSS 一起瘦是顺带的、也是必然的**：`import 'tdesign-vue-next/es/style/index.css'` 只有
 * 18.6 KB（基础样式 + token），各组件样式由各自的 `style/css.mjs` 提供，随 JS 模块一起
 * 被引入 —— 整库导入时把 77 套组件样式全拖了进来。所以这一处改动同时解决了「按需引入
 * TDesign」那件事，不需要动 `main.ts` 里的样式导入（那还得过视觉回归）。
 *
 * 已验证未丢样式：`.t-dialog__mask` / `.t-table` / `.t-progress` 等关键选择器计数与改前
 * 一致，被引用的 `--td-*` 变量定义只少了一个 `--td-anchor-space-base`（Anchor，未用）。
 * 丢掉的规则一律限定在未用组件的子树里（形如 `.t-upload__dialog .t-dialog`，
 * 只有渲染 upload 才可能命中）；另有 `t-header` 一个假警报 —— TDesign 的 Layout 区域
 * 组件渲染的是 `.t-layout__header`，`.t-header` 这个类改前改后都不存在。
 *
 * ## 维护规则
 *
 * 模板里新写一个 `<t-xxx>`，就把它加进下面的数组。漏加**不会**让任何构建环节失败：
 * 生产上 Vue 只会把它当成未解析的自定义元素静默渲染（没有内容、没有报错），
 * 而测试挂载器与生产用同一份注册表 → 由 `src/tdesign.test.ts` 扫模板逐个断言解析得到。
 *
 * ## 注册名 ≠ 导出名
 *
 * `withInstall(comp, alias)` 的 `install` 注册的是 `alias || name`，例如 `Table` 注册成
 * `t-table` 而它组件自身的 `name` 是 `TPrimaryTable`。所以守卫测试断言的是
 * 「`app.component()` 能不能解析到」，而不是比对名字。
 *
 * ## 一个结构后果：全局注册的组件无法按需切分
 *
 * 注册表是**静态**的，所以像 `t-table` 这种「只在详情弹窗里用」的大组件也必然进首屏 ——
 * 试过把详情链路改成 `defineAsyncComponent`，懒加载块只有 3.5 KB（gzip 1.5 KB），
 * 入口反而 +0.7 KB。要真正切分得改成组件局部注册，那是另一件事。
 */
import type { App, Plugin } from 'vue'
import {
  Alert,
  BackTop,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Dialog,
  Divider,
  Empty,
  HeadMenu,
  Header,
  Input,
  Layout,
  List,
  ListItem,
  MenuItem,
  Progress,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'tdesign-vue-next'

/** 模板里用到的 TDesign 组件（顺序即注册顺序，与渲染无关）。 */
export const TDESIGN_COMPONENTS: readonly Plugin[] = [
  Alert, // t-alert
  BackTop, // t-back-top
  Button, // t-button
  Card, // t-card
  Descriptions, // t-descriptions
  DescriptionsItem, // t-descriptions-item
  Dialog, // t-dialog
  Divider, // t-divider
  Empty, // t-empty
  HeadMenu, // t-head-menu
  Header, // t-header
  Input, // t-input
  Layout, // t-layout
  List, // t-list
  ListItem, // t-list-item
  MenuItem, // t-menu-item
  Progress, // t-progress
  Skeleton, // t-skeleton
  Space, // t-space
  Statistic, // t-statistic
  Switch, // t-switch
  Table, // t-table
  Tag, // t-tag
  Tooltip, // t-tooltip
]

/** 挂到 app 上的插件形态：`main.ts` 与 `src/test-utils/mount.ts` 共用同一份注册表。 */
export const TDesignComponents: Plugin = {
  install(app: App) {
    for (const component of TDESIGN_COMPONENTS) {
      app.use(component)
    }
  },
}
