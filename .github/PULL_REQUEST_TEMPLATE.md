<!--
标题格式：<type>: <一句话结论>   例如  fix: 窄屏导航两行后锚点避让量跟着导航高度走
type 用 fix / feat / docs / refactor / test / chore
-->

## 这个 PR 解决什么

<!-- 一句话说清问题。有对应 issue 就写 Refs #123。 -->

## 怎么做

<!-- 讲"为什么这么做"，而不是逐条罗列改了哪些文件 —— 那些看 diff 就有。 -->

## 验收对照

<!--
如果对应 issue 有验收清单，逐条给结论（✅ / ⚠️ / ❌ + 理由）。
⚠️ 表示"按另一套口径执行了"，请把口径写清楚，不要留空。
-->

| 验收项 | 结果 |
| ------ | ---- |
|        |      |

## 门禁

四道必须全绿，顺序固定（`vp check` 最后）：

- [ ] `bun run test:unit`
- [ ] `bun run build` —— **改了 `.vue` 就必须跑**，`vp check` 不做模板类型检查
- [ ] `bun run test:e2e`
- [ ] `bunx vp check`（0/0；有格式问题先 `--fix` 再复跑一次）

```
unit: ? passed / ?
e2e:  ? passed / ? skipped
vp check: 0 error / 0 warning
```

## 自查

- [ ] **没有**真实凭据入库：`git diff --cached` 里没有真实 API Key / Cookie / Token / 个人站点域名
- [ ] 测试夹具里的账号 id、命名空间、代金券码是编造的占位值
- [ ] 改了列策略（`shouldSpanFullRow` / `isCompactAccounts` / `metricGridClass` / `windowContainerClass`）时，`App.vue` 的绑定与 `layout.css` 的规则**一起改了**
- [ ] 改了可视化规格（间距 / 精度 / 列策略）时，同步更新了 `docs/design-baseline.md`
- [ ] 新增平台时，`server/env-vars.ts` + `.env.example` + `.dev.vars.example` 三处一起动了
- [ ] 新增 `server/*.test.ts` 已确认被 `tsconfig.vitest.json` 收录（否则假通过）
- [ ] 重构与行为变更**没有**混在同一个 commit 里
