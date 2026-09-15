/**
 * 平台 → 「可用模型」官方文档地址。
 *
 * 卡片标题就是平台名（如「火山方舟 Agent Plan」「模力方舟（Gitee AI）」），
 * 因此链接只需按标题查表即可，不必让每个区块组件各自传一遍 URL：
 * 新增平台卡时补一行映射就自动生效，不会出现「某张卡忘了接」的漏网。
 *
 * 匹配用的是**平台名的关键词**而非全等比较：同一平台在不同 Tab 下标题不同
 * （智谱 GLM Coding Plan / 智谱 GLM 余额、阿里云百炼 Token Plan / 资源包），
 * 全等比较要为每个变体各写一份，改名即失效。
 */

interface ModelDocLink {
  /** 匹配规则，对**小写后**的平台名生效；按数组顺序取首个命中。 */
  match: RegExp
  url: string
}

/**
 * 顺序即优先级：越具体的平台排越前。
 * 例如 OpenRouter 与 OpenCode 都以 Open 开头，显式分开匹配而非用公共前缀。
 */
const MODEL_DOC_LINKS: readonly ModelDocLink[] = [
  { match: /gitee|模力方舟/, url: 'https://ai.gitee.com/serverless-api' },
  { match: /openrouter/, url: 'https://openrouter.ai/models' },
  {
    match: /opencode/,
    url: 'https://opencode.ai/docs/zh-cn/go/#%E9%A2%84%E4%BC%B0%E8%AF%B7%E6%B1%82%E6%95%B0',
  },
  { match: /kimi/, url: 'https://www.kimi.com/code/docs/kimi-code/models.html' },
  { match: /minimax/, url: 'https://platform.minimaxi.com/docs/guides/models-intro' },
  {
    match: /volc|火山/,
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2516283?lang=zh',
  },
  {
    match: /aliyun|阿里|百炼/,
    url: 'https://help.aliyun.com/zh/model-studio/token-plan-personal-overview#%E6%94%AF%E6%8C%81%E7%9A%84%E6%A8%A1%E5%9E%8B',
  },
  {
    match: /zhipu|智谱|glm/,
    url: 'https://docs.bigmodel.cn/cn/coding-plan/overview#%E7%A7%AF%E5%88%86%E6%8A%B5%E6%89%A3%E8%AE%A1%E7%AE%97%E6%96%B9%E5%BC%8F',
  },
  { match: /deepseek/, url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/' },
  { match: /baidu|百度|千帆/, url: 'https://cloud.baidu.com/doc/qianfan-docs/s/7m95lyy43' },
]

/** 平台名对应的「可用模型」文档地址；查不到时返回 null（调用方据此不渲染链接）。 */
export function modelDocsUrl(platformName: string): string | null {
  const name = platformName.toLowerCase()
  return MODEL_DOC_LINKS.find((link) => link.match.test(name))?.url ?? null
}
