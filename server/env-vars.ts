/**
 * 服务端会读取的**全部**环境变量名 —— 全项目唯一的事实来源。
 *
 * 为什么要单独抽一个文件：`server/app.ts` 通过 `readKeys` / `readKeyPairs` /
 * `readPairedMap` / `labelMap` 读变量，名字散落在这些调用的参数里，没有一个可枚举的清单。
 * 于是三份环境变量文档（`.env.example` / `.dev.vars.example` / `.env`）各自手抄一份，
 * 抄着抄着就漂了 —— 实测 `.env.example` 漏了整个 `BAIDU_*`（百度千帆），而 `.dev.vars.example`
 * 没有 `SITE_*` 的启用行。用户看到的现象是「文档互相缺失、内容不一致」。
 *
 * 现在这份常量同时喂给三处，漂移会被单测挡住：
 *   1. `playwright.config.ts` —— 构造密封环境，逐个置空（见下）；
 *   2. `server/env-vars.test.ts` —— 校对 `.env.example` 与 `.dev.vars.example`
 *      的变量集合是否仍然覆盖这里登记的全部名字；
 *   3. 两份 example 文档的手写内容（按平台组织，见下）。
 *
 * 为什么必须逐字登记：`vite.config.ts` 用 `loadEnv(cwd, '', '')` —— **空前缀**加载本机
 * `.env`，因此任何没被置空的变量都会带着真实凭据进入测试服务器。
 * 症状极具误导性：`/api/status` 的 configured 变成 true、`/api/usage` 里该 provider 返回
 * `{data}` 而不是 `{error:{code:'NOT_CONFIGURED'}}`，
 * 表现为「密封环境的空态断言莫名其妙失败」，而报错位置离这里很远。
 * （New API 接入时就漏登记过 NEWAPI_* 三个变量，本机 `.env` 配上真实站点即复现。）
 *
 * 新增平台时**必须**把新的变量名加进来；E2E 的
 * `api status returns 200 and providers report unconfigured` 是这条规则的兜底断言。
 */

/**
 * 按**密封语义**分组：每组的 title 回答的都是「为什么这类变量也要置空」。
 *
 * 注意这是安全语义的分组，**不是文档分组** —— 文档（`.env.example` /
 * `.dev.vars.example`）按**平台**组织，因为用户是照着「我要接哪个平台」去填的，
 * 按「单 Key / 成对 / 旁路 / 别名」排反而找不到。两组顺序不同是有意的。
 */
export const SERVER_ENV_GROUPS = [
  {
    title: '单 Key 平台：填了就有卡，不置空会让空态断言拿到真数据',
    vars: [
      'DEEPSEEK_API_KEY',
      'ZHIPU_API_KEY',
      'GITEE_AI_API_KEY',
      'OPENROUTER_API_KEY',
      'KIMI_API_KEY',
      'MINIMAX_API_KEY',
      'OPENCODE_GO_API_KEY',
    ],
  },
  {
    title: '成对凭据：只置空一半会被 readKeyPairs 整对丢弃，卡片照样不出现 —— 必须成对处理',
    vars: [
      'VOLC_ACCESS_KEY_ID',
      'VOLC_SECRET_KEY',
      'ALIYUN_ACCESS_KEY_ID',
      'ALIYUN_SECRET_KEY',
      'BAIDU_ACCESS_KEY_ID',
      'BAIDU_SECRET_KEY',
      'NEWAPI_BASE_URL',
      'NEWAPI_TOKEN',
    ],
  },
  {
    title: '可选旁路凭据（会话 Cookie / 请求头）：不置空会让「未配置」分支根本走不到',
    vars: ['GITEE_AI_SESSION_COOKIE', 'ALIYUN_TOKENPLAN_COOKIE', 'NEWAPI_USER_ID'],
  },
  {
    title: '站点自定义：不改鉴权，但会改品牌文案与刷新节奏，留着同样会污染断言',
    vars: [
      'SITE_NAME',
      'SITE_LOGO_URL',
      'SITE_LOGO_URL_DARK',
      'SITE_FAVICON_URL',
      'REFRESH_INTERVAL_SECONDS',
    ],
  },
  {
    title: '账号别名：不影响鉴权，但会改变卡片标题，留着同样会污染断言',
    vars: [
      'DEEPSEEK_LABEL',
      'VOLC_LABEL',
      'ZHIPU_LABEL',
      'ALIYUN_LABEL',
      'GITEE_LABEL',
      'OPENROUTER_LABEL',
      'KIMI_LABEL',
      'MINIMAX_LABEL',
      'OPENCODE_GO_LABEL',
      'BAIDU_LABEL',
      'NEWAPI_LABEL',
      'ALIYUN_TOKENPLAN_LABEL',
    ],
  },
] as const

/** 上面分组的扁平展开（均不含 `_N` 多账号后缀）。 */
export const SERVER_ENV_VARS: readonly string[] = SERVER_ENV_GROUPS.flatMap((group) => group.vars)

/**
 * 示例文件里允许出现、但**不进密封环境**的宿主专属变量。
 *
 * `HOST` / `PORT` 只影响 Bun 生产模式监听地址，不改变任何断言，
 * 而 E2E 已经用 `--port 5173 --strictPort` 钉死了端口 —— 置空反而会让
 * `server/index.ts` 读到一个空串。所以它们属于「文档里有、密封环境不管」。
 */
export const HOST_LOCAL_ENV_VARS: readonly string[] = ['HOST', 'PORT']

/**
 * 变量名是否属于「本项目的环境变量」（含 `_N` 多账号后缀）。
 * 供文档校对与诊断使用。
 */
export function isKnownEnvVar(name: string): boolean {
  const base = name.replace(/_\d+$/, '')
  return SERVER_ENV_VARS.includes(base) || HOST_LOCAL_ENV_VARS.includes(base)
}
