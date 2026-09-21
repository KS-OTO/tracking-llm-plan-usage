import 'tdesign-vue-next/es/style/index.css'
import './assets/main.css'
// 布局与展示原语：必须在 TDesign 样式之后，才能覆盖其栅格默认值
import './assets/layout.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { TDesignComponents } from './tdesign'
// 品牌主题层：覆盖 TDesign 的 `--td-*` 设计变量。
//
// **必须放在最后**，不能和上面那三个样式 import 排在一起：TDesign 的组件样式是由
// `./tdesign` 这个 import 才带进模块图的（各组件 `style/css.mjs`），写在前面会被它们
// 覆盖掉。覆盖靠的是「同特异性、后出现」，所以顺序就是正确性。
import './assets/theme.css'

const app = createApp(App)
app.use(createPinia())
// 只注册用到的组件（见 src/tdesign.ts）：整库默认导出不可摇树，实测多 287 KB gzip
app.use(TDesignComponents)

app.mount('#app')
