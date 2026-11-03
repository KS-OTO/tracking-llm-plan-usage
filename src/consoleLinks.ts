/**
 * 各平台控制台地址（详情弹窗 ④ 的「控制台」外链）。
 *
 * 统一收在这一张表里，而不是散落到 10 个适配器：同一个平台在“套餐订阅”和
 * “余额账户”两个 Tab 可能各有一张卡，但控制台入口只能是同一个地址。
 *
 * `provider` 的键与适配器里的平台名一致；自托管 / 可换区的平台
 * （New API、Sub2API、MiniMax、ZenMux）由服务端额外下发 `consoleUrl`，
 * 调用方通过第二个参数传入，优先于静态表。
 */
import type { LinkField } from './types'
import { link } from './detail'

const CONSOLE_URLS: Record<string, string> = {
  DeepSeek: 'https://platform.deepseek.com/usage',
  Volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/agentPlan',
  Zhipu: 'https://www.bigmodel.cn/console/usage',
  Aliyun: 'https://bailian.console.aliyun.com/',
  'Aliyun Token Plan':
    'https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan/personal',
  Gitee: 'https://ai.gitee.com/v5/console',
  Baidu: 'https://console.bce.baidu.com/qianfan/ais/console/usage',
  OpenRouter: 'https://openrouter.ai/credits',
  StepFun: 'https://platform.stepfun.com/',
  SiliconFlow: 'https://cloud.siliconflow.cn/account/ak',
  'SiliconFlow（国际站）': 'https://cloud.siliconflow.com/account/ak',
  'Novita AI': 'https://novita.ai/billing',
  'Kimi For Coding': 'https://platform.kimi.com/console',
  MiniMax: 'https://platform.minimax.cn/console/home',
  'OpenCode Go': 'https://opencode.ai/console/go',
  'Command Code': 'https://commandcode.ai/settings/billing',
  ZenMux: 'https://zenmux.ai/',
}

/** 详情弹窗底部的「控制台」外链；没有地址时返回空数组（保持 `links` 恒为数组）。 */
export function consoleLinks(provider: string, url?: string | null): LinkField[] {
  const target = url?.trim() || CONSOLE_URLS[provider]
  return target ? [link('控制台', target, 'console')] : []
}
