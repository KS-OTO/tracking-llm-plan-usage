import 'tdesign-vue-next/es/style/index.css'
import './assets/main.css'
// 布局与展示原语：必须在 TDesign 样式之后，才能覆盖其栅格默认值
import './assets/layout.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(TDesign)

app.mount('#app')
