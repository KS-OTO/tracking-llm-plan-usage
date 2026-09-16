import { describe, expect, it } from 'vite-plus/test'

import { modelDocsUrl } from './modelDocs'

const VOLC = 'https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2516283?lang=zh'
const ZHIPU =
  'https://docs.bigmodel.cn/cn/coding-plan/overview#%E7%A7%AF%E5%88%86%E6%8A%B5%E6%89%A3%E8%AE%A1%E7%AE%97%E6%96%B9%E5%BC%8F'
const ALIYUN =
  'https://help.aliyun.com/zh/model-studio/token-plan-personal-overview#%E6%94%AF%E6%8C%81%E7%9A%84%E6%A8%A1%E5%9E%8B'
const DEEPSEEK = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
const GITEE = 'https://ai.gitee.com/serverless-api'
const BAIDU = 'https://cloud.baidu.com/doc/qianfan-docs/s/7m95lyy43'
const OPENROUTER = 'https://openrouter.ai/models'
const OPENCODE = 'https://opencode.ai/docs/zh-cn/go/#%E9%A2%84%E4%BC%B0%E8%AF%B7%E6%B1%82%E6%95%B0'
const KIMI = 'https://www.kimi.com/code/docs/kimi-code/models.html'
const MINIMAX = 'https://platform.minimaxi.com/docs/guides/models-intro'

describe('modelDocsUrl', () => {
  it('resolves every platform card title rendered by the app', () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      ['火山方舟 Agent Plan', VOLC],
      ['智谱 GLM Coding Plan', ZHIPU],
      ['智谱 GLM 余额', ZHIPU],
      ['阿里云百炼 Token Plan', ALIYUN],
      ['阿里云百炼 资源包', ALIYUN],
      ['DeepSeek 余额', DEEPSEEK],
      ['模力方舟（Gitee AI）', GITEE],
      ['百度千帆', BAIDU],
      ['OpenRouter', OPENROUTER],
      ['OpenCode Go', OPENCODE],
      ['Kimi For Coding', KIMI],
      ['MiniMax', MINIMAX],
    ]
    for (const [name, url] of expected) {
      expect(modelDocsUrl(name)).toBe(url)
    }
  })

  it('returns null for titles without a known platform (no link rendered)', () => {
    // 「订阅套餐」是未配置任何订阅密钥时的兜底卡标题，不是平台名
    expect(modelDocsUrl('订阅套餐')).toBeNull()
    expect(modelDocsUrl('额度预警')).toBeNull()
    expect(modelDocsUrl('')).toBeNull()
  })

  it('matches regardless of letter case', () => {
    expect(modelDocsUrl('MINIMAX')).toBe(MINIMAX)
    expect(modelDocsUrl('deepseek')).toBe(DEEPSEEK)
  })

  it('keeps OpenRouter and OpenCode apart (both start with "Open")', () => {
    expect(modelDocsUrl('OpenRouter')).toBe(OPENROUTER)
    expect(modelDocsUrl('OpenCode Go')).toBe(OPENCODE)
  })
})
