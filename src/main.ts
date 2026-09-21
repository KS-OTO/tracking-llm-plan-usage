import 'tdesign-vue-next/es/style/index.css'
import './assets/main.css'
// 布局与展示原语：必须在 TDesign 样式之后，才能覆盖其栅格默认值
import './assets/layout.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { TDesignComponents } from './tdesign'

const app = createApp(App)
app.use(createPinia())
// 只注册用到的组件（见 src/tdesign.ts）：整库默认导出不可摇树，实测多 287 KB gzip
app.use(TDesignComponents)

app.mount('#app')
