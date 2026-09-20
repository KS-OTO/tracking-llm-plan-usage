# LLM Usage Monitor (tracking-llm-plan-usage)

[简体中文](README.md) | **English**

[![CI](https://github.com/KS-OTO/tracking-llm-plan-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/KS-OTO/tracking-llm-plan-usage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2%2B-black?logo=bun)](https://bun.sh)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white)](https://vuejs.org)
[![TDesign Vue Next](https://img.shields.io/badge/TDesign-Vue%20Next-0052d9)](https://tdesign.tencent.com/vue-next/)
[![Node](https://img.shields.io/badge/Node-%5E22.18%20%7C%7C%20%3E%3D24.12-339933?logo=node.js&logoColor=white)](package.json)
[![Demo](https://img.shields.io/badge/Demo-cp--ai101.18bit.cn-2ea44f)](https://cp-ai101.18bit.cn/)

## About

An open-source web tool that shows the balances and usage quotas of DeepSeek, Volcano Ark, Zhipu,
Alibaba Cloud, Gitee AI, Baidu Qianfan, OpenRouter, New API (self-hosted gateway) and subscription
plans (Kimi / MiniMax / OpenCode Go) **on a single page**. Configure the API keys / access keys in
environment variables and you are done — nothing else to set up.

**Live demo: <https://cp-ai101.18bit.cn/>**

The problem it solves is narrow and concrete: balances and quota windows for these platforms are
scattered across their respective consoles, and some of them do not even expose an API for it
(only a browser session cookie works). Answering "will I run out this month?" means logging into
each console in turn. This project collapses that into **one request, one page**, with every
credential interaction happening server-side — the browser never receives a key.

It is **not** a proxy gateway. It does not forward model requests and does not log your
conversations. It reads balances and usage, and nothing else.

> This English document is a full translation of [`README.md`](README.md). If the two ever
> disagree, the Chinese version is authoritative.

## Table of contents

- [About](#about) · [Features](#features) · [Only three endpoints](#only-three-endpoints) · [Quick start](#quick-start)
- [Deployment](#deploy-to-cloudflare-workers): [Cloudflare Workers](#deploy-to-cloudflare-workers) / [EdgeOne Makers](#deploy-to-edgeone-makers) / [Other platforms](#deploy-to-other-platforms-vercel-etc)
- [Environment variables](#environment-variables) · [Multi-account support](#multi-account-support) · [Site customization](#site-customization-name--logo--favicon--refresh-interval)
- [Common commands](#common-commands) · [Repository layout](#repository-layout) · [References](#references)
- [Security](#security) · [Contributing](#contributing) · [License](#license) · [简体中文](README.md)

## Features

Page behaviour:

- **Responsive multi-column layout**: multiple columns on desktop, two on tablet, one on phone.
  Platforms are grouped under "Plans" / "Balance accounts" tabs instead of one long scrolling list.
  Layout is decided solely by the semantic grid primitives in `src/assets/layout.css` (components
  never declare breakpoints): **every layer of card fills the height handed down to it**, so a
  section card → account card → quota-window block in the same row are **strictly equal-height at
  all three levels**. A section holding ≥2 keys automatically **takes a full row**, so keys sit
  side by side instead of collapsing into "one per line plus wrapping".
- **Navigation never overflows on narrow screens**: at ≤767px the navbar folds into two rows — brand
  and actions share the first, the three tabs **split the second row evenly**. The "updated at"
  text moves down to the top of the content area (only "next refresh" stays in the navbar). The
  anchor offset follows the navbar's real height (`--app-menu-h` / `--app-anchor-offset`), so
  jumping to an anchor never hides the heading under the navbar.
- **Platform card ordering**: **platforms with more keys (accounts) come first**
  (3 keys > 2 keys > 1 key); ties are broken by the first letter of the platform name, A→Z.
  Chinese names are romanised to pinyin and interleaved with Latin names in a single sequence
  (Aliyun→A, Baidu→B, DeepSeek→D, Gitee→G, OpenRouter→O, Zhipu→Z) rather than dumping every English
  platform after the Chinese ones. Both tabs and the overview's "platform navigation" card share
  one order, so clicking a platform navigates to the matching position on the page.
- **"Available models" links straight to the docs**: every platform card has an "Available models ↗"
  link next to its title that opens that platform's official model/pricing documentation in a new
  tab — Volcano Ark, Zhipu GLM, Alibaba Bailian, DeepSeek, Gitee AI, Baidu Qianfan, OpenRouter,
  OpenCode Go, Kimi and MiniMax are all covered. The URL is looked up by **card title (platform
  name)** in a single table in `src/modelDocs.ts`: one platform whose title differs between tabs
  (e.g. "Zhipu GLM Coding Plan" vs "Zhipu GLM balance") still needs only one keyword mapping, and
  adding a platform is one extra row. The overview's navigation card carries the same link; clicking
  it opens the docs without also triggering that card's anchor jump.
- **Predictable refresh cadence**: the header shows both "updated at HH:MM:SS" and
  "next refresh HH:MM:SS" (180 seconds by default, tunable via `REFRESH_INTERVAL_SECONDS`). When
  auto-refresh is off or the page moves to the background, the latter reads "paused" — it never
  advertises a time that will not arrive.
- **Bring your own branding**: site name, logo and favicon are all replaceable via environment
  variables; see [Site customization](#site-customization-name--logo--favicon--refresh-interval).
- **Dark mode**: one-click toggle, persisted in `localStorage`, defaulting to the system
  `prefers-color-scheme`.
- **Accessibility**: semantic landmarks (header/main/footer), keyboard reachable, ARIA labelling,
  contrast aligned with the official TDesign tokens.
- **Skeletons / error alerts / empty states**: all carried by TDesign Skeleton / Alert / Empty.
- **Cards show only high-priority readings**: only window usage, balances and status — the numbers
  you look at daily. Account identity, subscription metadata, detail tables and secondary metrics
  all live behind the "details" dialog in the card's top-right corner and are expanded on demand.
- **Account labels**: with multiple keys, `*_LABEL` gives each key a human-readable name; the card
  title shows the label and the masked key drops to a secondary position (see
  [Account labels](#account-labels-recommended-for-multi-key-teams)).

| Data source                      | API                                                                                                                                                                                                                           | What is displayed                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DeepSeek                         | `GET /user/balance`                                                                                                                                                                                                           | Total balance, topped-up balance, granted balance (CNY/USD), availability                                                                                                                                                                                                                                                                        |
| Volcano Ark Agent Plan           | `GetPersonalPlan` + `GetAFPUsage` + `GetUsageDetails` + `GetCodingPlanUsage` + `GetInferenceUsage`                                                                                                                            | The card shows the Agent Plan's 5-hour/weekly/monthly quotas and progress plus reset countdown; the model daily quota (image/video/voice models and Harness only), plan tier and validity, Coding Plan status and window quotas, model call details and inference usage for the last N days (filterable by model) all live in the details dialog |
| Zhipu GLM                        | `GET /api/monitor/usage/quota/limit` (Coding Plan) + console biz API (balance/resource packs)                                                                                                                                 | Coding Plan tier and 5-hour/weekly window quotas, account balance, token resource pack details                                                                                                                                                                                                                                                   |
| Alibaba Cloud Bailian            | `QueryResourcePackageInstances` (BSS)                                                                                                                                                                                         | Token resource pack instances: total/remaining, validity, status, applicable product (requires BSS read-only permission)                                                                                                                                                                                                                         |
| Alibaba Cloud Bailian Token Plan | ModelStudio OpenAPI (ROA): `GetSubscriptionSeatDetails` / `ListSubscriptionSharedPackages`; personal-edition usage via the console gateway (`zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/*`, either cookie or AK/SK)       | TokenPlan account/organisation info, subscription seats and shared packs with CREDITS quota periods, total/remaining; **personal edition** 5-hour/7-day window usage, subscription status and days remaining, add-on credits, reset cards                                                                                                        |
| Gitee AI                         | `GET /tokens/packages/balance` + internal endpoints (cookie)                                                                                                                                                                  | Resource pack total/used/remaining, coupon balance and details (requires session cookie)                                                                                                                                                                                                                                                         |
| Baidu Qianfan                    | Platform OpenAPI (`/v2/charge` + `/v2/service`, BCE AK/SK signature)                                                                                                                                                          | Volume packs (total/used/expiry/status) + TPM quota + last-7-days call overview (tokens/calls/services)                                                                                                                                                                                                                                          |
| OpenRouter                       | `GET /api/v1/credits` + `GET /api/v1/key`                                                                                                                                                                                     | Remaining credit / limit remaining / today's usage (under "balance accounts"); total topped up, weekly and monthly usage and key metadata live in the details dialog                                                                                                                                                                             |
| New API (self-hosted)            | Management endpoints `/api/user/self` + `/api/log/self/stat` + `/api/data/self` (system access token); falls back to the OpenAI-compatible `/v1/dashboard/billing/*` (ordinary API key) when management permission is missing | **Subscription** (period quota windows: used percentage, period quota, next reset) goes under "plans"; **wallet** (remaining / total used / request count) goes under "balance accounts"; when both exist the subscription is the primary reading and the wallet secondary                                                                       |
| Subscription plans (optional)    | Kimi For Coding (`/coding/v1/usages`) / MiniMax (`coding_plan/remains`) / **OpenCode Go** (`/zen/go/v1/usage`), all served by the `plans` slice of `/api/usage`                                                               | Window-based **subscription quotas** alongside Volcano/Zhipu/Bailian under the "plans" tab. **One card per platform, titled with the platform name**; the card shows window progress bars, while account identity and window details are in the details dialog                                                                                   |

Keys exist only in server-side environment variables. The frontend never touches a key and only
ever renders a mask.

### Only three endpoints

The page runs on edge clouds, and some platforms bill by **node lifetime** — the endpoint count
directly determines how often a node is woken and how long it lives. All readings are therefore
merged into three endpoints (down from thirteen):

| Endpoint                        | When it is called                         | Notes                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/status`               | Once on first paint                       | Returns **configuration state only** (which platforms have how many keys, which half is missing, site customisation) and makes **zero upstream calls**, so it is very fast                      |
| `GET /api/usage`                | On every refresh                          | Merges the readings of ten platforms into **one envelope**, see below                                                                                                                           |
| `GET /api/volc/inference-usage` | On demand (when the model filter changes) | Volcano inference usage. **Deliberately not merged**: it is the only reading endpoint that takes user input, and merging it would turn "change a model filter" into "refetch all ten platforms" |

The shape of the `/api/usage` envelope:

```jsonc
{
  "providers": {
    "deepseek": { "data": { "accounts": [] } }, // success
    "newapi": { "error": "not configured …", "code": "NOT_CONFIGURED" }, // not configured
    "zhipu": { "error": "…", "code": "Zhipu_HTTP_500" }, // genuine failure
  },
  "fetchedAt": 1789616585319,
}
```

Two design points:

- **Every platform is an independent slice**, so one failure never contaminates the other nine (and
  never turns the whole envelope into a 500). Unconfigured platforms return `NOT_CONFIGURED` and
  render as a neutral empty state rather than a wall of errors. **An unconfigured key never stops
  other platforms from rendering.**
- **The server has a TTL cache plus single-flight**: on a cache hit the **upstream call count is
  zero**, and concurrent refreshes share one upstream request. TTL has two tiers matching how fast
  the data moves — 60 seconds for balances/usage, 300 seconds for structural data (resource packs,
  plans, seats). With the default 180-second refresh interval, the daily-changing items only hit
  upstream about once every two automatic refreshes.

## Quick start

```bash
bun install
cp .env.example .env      # fill in your keys
vp dev                    # one command: frontend + built-in API (reads .env)
```

Open <http://localhost:5173> to see the dashboard.

> The API is built into dev mode: `server/app.ts` is mounted into the Vite dev server, so `vp dev`
> is a single process and needs no separate backend. `bun run dev:all` (backend and frontend
> separately) still works.

Production mode:

```bash
vp build                  # build the frontend into dist/
bun run server            # Bun server: serves the API and the static page on one port
```

Open <http://127.0.0.1:8787> to see the dashboard.

## Deploy to Cloudflare Workers

One-command deployment (build and upload in one step):

```bash
bun run deploy            # = vp build && wrangler deploy
```

- Static assets: Workers Assets serves `dist/` (SPA fallback is configured)
- API: `worker/index.ts` reuses `server/app.ts` (platform-agnostic, Web Crypto signatures)
- Secrets: set them one by one with `wrangler secret put DEEPSEEK_API_KEY` etc.; for local
  debugging use `.dev.vars` (see `.dev.vars.example`)
- Multi-account variables use the same `_N` suffix (e.g. `DEEPSEEK_API_KEY_2`)

## Deploy to EdgeOne Makers

The repository already contains the Makers adapter layer. In the console, point the function
directory at `cloud-functions/`:

- `cloud-functions/api/[[default]].js` — catches all of `/api/*` and dynamically
  `import('../../server/app.ts')` to reuse the same `createAppHandler`. If the dependency chain
  fails to load it returns a structured `FN_IMPORT_FAILED` instead of crashing into 5xx HTML.
- `cloud-functions/api/diag.js` — a zero-dependency self-diagnostic. Visiting `/api/diag`
  distinguishes "the function system is broken" from "the dependency chain failed to load" and
  lists the environment variable names known to the runtime (key/secret-like ones show only
  `<set>`), which is how you confirm that online variables were injected.
- `edgeone.json` configures the cloud function timeout and regions (`maxDuration: 60`, Guangzhou /
  Singapore).
- Environment variables are configured in the Makers console under EnvVars and injected via
  `context.env`; the `_N` multi-account scheme applies here too.

## Deploy to other platforms (Vercel, etc.)

`server/app.ts` is platform-agnostic (it depends only on the Web Fetch API and Web Crypto, never on
`node:crypto`), so any platform offering "a single HTTP entry point plus environment variable
injection" can host it. Write the adapter under `api/` by following
`cloud-functions/api/[[default]].js`.

There are two hard constraints when filling in variables in a platform dashboard. Read
[How to fill in cookies](#how-to-fill-in-cookies) before configuring:

- **Values may not contain spaces, newlines or tabs** — so for the Bailian cookie paste only the
  ticket's **value**, never the whole `Cookie` header. Where the whole header really is required
  (the Gitee AI session cookie), `encodeURIComponent` it first; see
  [How to fill in cookies](#how-to-fill-in-cookies).
- **Dashboards do not expand `$`** — paste the raw value and **do not** add `\$` (that is only
  needed for a local `.env`).

Two more things that are easy to trip over:

- **You must redeploy after changing a variable**: Vercel and Workers bake configuration into the
  build artifact, so editing a dashboard value does not affect an instance that is already
  running. Trigger a new deployment (or hit Redeploy).
- **Do not use `echo` when configuring from the CLI**: `echo` appends a newline, which is exactly
  the character the dashboard rejects. The server `trim()`s values, so a written newline will not
  corrupt the request, but the dashboard will refuse the entry outright.

  ```bash
  # ✅ printf adds no trailing newline
  printf '%s' '<value of login_aliyunid_ticket>' | vercel env add ALIYUN_TOKENPLAN_COOKIE production
  # ❌ echo writes a trailing \n
  echo '<value>' | vercel env add ALIYUN_TOKENPLAN_COOKIE production
  ```

  When diagnosing a "session expired" error online, the error includes **the length of the
  currently configured value**; compare it with what you copied from the browser:

  - **Shorter** → a literal `$` in the local `.env` was not escaped and variable expansion ate
    characters;
  - **Same length but still failing** → the session really has expired; just copy it again.

## Multi-account support

Every platform supports multiple credential sets: the first uses the base variable name and the
Nth appends an `_N` suffix (numbering is consecutive and stops at the first gap). For example,
three DeepSeek accounts use `DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEY_2` and `DEEPSEEK_API_KEY_3`.
Paired credentials (access key / secret key) group by the same number: `VOLC_ACCESS_KEY_ID_2` with
`VOLC_SECRET_KEY_2`. Each account is queried and fault-isolated independently, and the dashboard
shows one card per account.

### Account labels (recommended for multi-key teams)

A masked key (`sk-f61c****L3Qe`) means nothing to a human — with five keys on one platform there is
no way to tell which is which. Give each key a label and the card's main heading shows the label,
with the mask demoted to a disambiguating role.

Variable naming: **append `_LABEL` to the credential variable's prefix**, and `_LABEL_N` for the
Nth set, paired with the credential **by number**.

```bash
# Five OpenCode Go subscriptions, tagged by owning team
OPENCODE_GO_API_KEY=sk-aaaa...
OPENCODE_GO_LABEL=Frontend team subscription
OPENCODE_GO_API_KEY_2=sk-bbbb...
OPENCODE_GO_LABEL_2=Backend team key
OPENCODE_GO_API_KEY_3=sk-cccc...
OPENCODE_GO_LABEL_3=Algorithms (long context)
```

Label prefixes per platform:

| Platform                                              | Credential variable       | Label variable           |
| ----------------------------------------------------- | ------------------------- | ------------------------ |
| DeepSeek                                              | `DEEPSEEK_API_KEY`        | `DEEPSEEK_LABEL`         |
| Volcano Ark                                           | `VOLC_ACCESS_KEY_ID`      | `VOLC_LABEL`             |
| Zhipu GLM                                             | `ZHIPU_API_KEY`           | `ZHIPU_LABEL`            |
| Alibaba Cloud (resource packs / Token Plan org·seats) | `ALIYUN_ACCESS_KEY_ID`    | `ALIYUN_LABEL`           |
| Alibaba Token Plan personal (cookie only)             | `ALIYUN_TOKENPLAN_COOKIE` | `ALIYUN_TOKENPLAN_LABEL` |
| Gitee AI                                              | `GITEE_AI_API_KEY`        | `GITEE_LABEL`            |
| Baidu Qianfan                                         | `BAIDU_ACCESS_KEY_ID`     | `BAIDU_LABEL`            |
| OpenRouter                                            | `OPENROUTER_API_KEY`      | `OPENROUTER_LABEL`       |
| Kimi For Coding / MiniMax                             | `KIMI_API_KEY` etc.       | `KIMI_LABEL` etc.        |
| OpenCode Go                                           | `OPENCODE_GO_API_KEY`     | `OPENCODE_GO_LABEL`      |

Three rules that are easy to get wrong:

- **Pairing is by number, not by value.** `*_LABEL_2` refers to the second credential set. A gap in
  the numbering (having `_1` and `_3` but no `_2`) makes every subsequent set unreadable.
- **Do not use `ALIYUN_LABEL` for a cookie-only account**: with no AK/SK there is no counterpart for
  `ALIYUN_LABEL` to pair with, so the label is ignored. Use `ALIYUN_TOKENPLAN_LABEL` instead.
- **When both credential kinds exist at the same number (AK/SK plus cookie)**, the label comes from
  `ALIYUN_LABEL` — they are the same account and produce a single card.

Labels affect display only. They take no part in authentication or querying.

## Environment variables

Every variable (including the `*_LABEL` aliases) is registered in `SERVER_ENV_VARS` in
`server/env-vars.ts` — that is the single source of truth. When adding a platform, edit it there;
`.env.example` and `.dev.vars.example` are checked against it by `server/env-vars.test.ts`, so a
missing registration fails the test suite instead of producing a "documented but ineffective"
variable.

The three configuration files divide responsibilities so that no explanation is maintained twice:

| File                | Purpose                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`      | **The main template**: most complete variable set, most detailed comments, and the reference when filling in a platform dashboard |
| `.dev.vars.example` | The Cloudflare Workers variant: **same set, same order**, covering only Workers-specific differences                              |
| `.env`              | Your real local values (gitignored, never committed), grouped in the same order as `.env.example`                                 |

| Variable                   | Required | Description                                                                                                                                                              |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEEPSEEK_API_KEY`         | No       | DeepSeek API key (balance query), created at <https://platform.deepseek.com/api_keys>                                                                                    |
| `VOLC_ACCESS_KEY_ID`       | No       | Volcano Ark access key ID (control-plane API signature)                                                                                                                  |
| `VOLC_SECRET_KEY`          | No       | Volcano Ark secret access key                                                                                                                                            |
| `ZHIPU_API_KEY`            | No       | Zhipu open-platform API key (resource packs/balance), from <https://open.bigmodel.cn/usercenter/apikeys>                                                                 |
| `ALIYUN_ACCESS_KEY_ID`     | No       | Alibaba Cloud AccessKey ID (BSS resource packs + Token Plan org/seats), from <https://ram.console.aliyun.com/manage/ak>                                                  |
| `ALIYUN_SECRET_KEY`        | No       | Alibaba Cloud AccessKey secret                                                                                                                                           |
| `ALIYUN_TOKENPLAN_COOKIE`  | No       | The **value** of `login_aliyunid_ticket` from the Bailian console cookie (Token Plan personal-edition usage, no permissions needed; see the notes on value format below) |
| `GITEE_AI_API_KEY`         | No       | Gitee AI access token (resource pack balance), created at <https://ai.gitee.com>                                                                                         |
| `GITEE_AI_SESSION_COOKIE`  | No       | Gitee AI web session cookie (coupon lookup; the whole string contains spaces, so platform dashboards need the encoded value — see "How to fill in cookies")              |
| `BAIDU_ACCESS_KEY_ID`      | No       | Baidu Cloud Qianfan access key ID (BCE signature), from <https://console.bce.baidu.com/iam/#/iam/accesslist>                                                             |
| `BAIDU_SECRET_KEY`         | No       | Baidu Cloud Qianfan secret access key (a sub-account with `QianfanServiceReadAccessPolicy` read-only is recommended)                                                     |
| `OPENROUTER_API_KEY`       | No       | OpenRouter remaining credit and limits, from <https://openrouter.ai/keys>                                                                                                |
| `KIMI_API_KEY`             | No       | Kimi For Coding Token Plan quota, from <https://platform.moonshot.cn>                                                                                                    |
| `MINIMAX_API_KEY`          | No       | MiniMax Token Plan quota, from <https://platform.minimaxi.com>                                                                                                           |
| `OPENCODE_GO_API_KEY`      | No       | OpenCode Go subscription quota (5-hour/7-day/30-day windows), from <https://opencode.ai>                                                                                 |
| `NEWAPI_BASE_URL`          | No       | New API site URL (self-hosted, e.g. `https://ai.example.com/`); additional sites use `_2` / `_3`                                                                         |
| `NEWAPI_TOKEN`             | No       | New API **system access token** (management API auth, see "How to obtain a New API token"); additional sites use `_2` / `_3`                                             |
| `NEWAPI_USER_ID`           | No       | User ID for management queries that need one (paired by number with `NEWAPI_BASE_URL`, optional)                                                                         |
| `NEWAPI_LABEL`             | No       | Site label (paired by number with `NEWAPI_BASE_URL`, optional)                                                                                                           |
| `SITE_NAME`                | No       | Site name (navbar brand slot + browser tab title), defaults to "LLM 用量监控"; see "Site customization"                                                                  |
| `SITE_LOGO_URL`            | No       | Logo URL for light mode (must be https; loaded directly by the browser, so CORS does not apply). Without it, only the text title is shown                                |
| `SITE_LOGO_URL_DARK`       | No       | Logo URL used only in dark mode (must be https); dark mode falls back to `SITE_LOGO_URL` when unset                                                                      |
| `SITE_FAVICON_URL`         | No       | Tab icon URL (must be https); unset keeps the bundled `/favicon.ico`                                                                                                     |
| `REFRESH_INTERVAL_SECONDS` | No       | Frontend auto-refresh interval in seconds, default `180`, allowed range 10–3600                                                                                          |
| `HOST`                     | No       | Listen address, default `127.0.0.1`                                                                                                                                      |
| `PORT`                     | No       | Listen port, default `8787`                                                                                                                                              |

Create the Volcano Ark access key at <https://console.volcengine.com/iam/keymanage>; an IAM
sub-user with only Ark-related permissions is recommended. For Alibaba Cloud, a RAM sub-user is
recommended: the Token Plan organisation/seat section needs `AliyunTokenPlanReadOnlyAccess`, while
the resource-pack section needs read-only billing-centre permission
(`bss:QueryResourcePackageInstances`) — grant them separately as needed. Personal-edition usage
only needs the session cookie and no permission at all.

A platform's section only appears once its variables are complete. Every credential variable
supports a `*_LABEL` / `*_LABEL_N` alias at the same number (see
[Account labels](#account-labels-recommended-for-multi-key-teams)).

OpenCode Go's usage endpoint returns a `status` per window (`ok` / `rate-limited`) in its 200
response. When a window is throttled upstream, the endpoint reports `percent: 100` **and**
`status: "rate-limited"` — the two mean different things, so the dashboard labels that state as
"rate-limited upstream" with an explanation rather than just showing 100%.

New API is a **self-hosted gateway**, and the same deployment may enable two billing modes at once:
a topped-up **wallet balance** (decreases, never resets) and a **subscription quota** (resets on a
periodic window, commonly 30 days). The server decides which one an account uses from the quota
fields and subscription status returned by the management API and files it under the right tab — so
you never have to declare by hand which mode your key belongs to. When both are enabled
(`mode: 'both'`), the subscription is the primary reading and the wallet is secondary, and the
dialog shows the site's deduction preference (`subscription_first` / `wallet_first`). Because you
supply the site URL, the card's "console ↗" (`{baseUrl}/dashboard`) and "available models ↗"
(`{baseUrl}/pricing`) links are built from it; with multiple sites no card-level links are given
(one link cannot point at two sites) and they appear inside each dialog instead.

> **Value handling differs by environment**: platform dashboards (Vercel / EdgeOne Makers /
> Cloudflare Workers) **store values verbatim** and perform no expansion, while a local `.env` /
> `.dev.vars` expands `$`. Values containing `$` (such as the Bailian ticket) must be escaped
> locally — see [How to fill in cookies](#how-to-fill-in-cookies).

### Site customization: name / logo / favicon / refresh interval

All four are configured through environment variables. They are deliberately not frontend
build-time variables (`VITE_*`): the same build artifact runs on four different hosts (Bun,
Cloudflare Workers, EdgeOne, Vercel), and the deployment flow has users configuring **runtime**
variables in a platform dashboard. A build-time variable would turn "change the site name" into
"rebuild and re-upload the artifact". The server reads these variables at startup and ships them
with `/api/status`, so **restarting the service is enough — no frontend rebuild**.

| Variable                   | Default                       | Effect                                                   |
| -------------------------- | ----------------------------- | -------------------------------------------------------- |
| `SITE_NAME`                | `LLM 用量监控`                | Navbar brand slot + tab title; **empty means logo only** |
| `SITE_LOGO_URL`            | none (text only)              | Light-mode logo (also the dark-mode fallback)            |
| `SITE_LOGO_URL_DARK`       | falls back to `SITE_LOGO_URL` | Dark-mode-only logo                                      |
| `SITE_FAVICON_URL`         | bundled `/favicon.ico`        | Browser tab icon                                         |
| `REFRESH_INTERVAL_SECONDS` | `180`                         | Frontend auto-refresh interval in seconds, 10–3600       |

Two notes on the site name:

- **It may be left empty**: `SITE_NAME=` (explicitly empty) means the brand slot shows **only the
  logo** — common when the logo is already a complete lockup of mark plus wordmark, since adding a
  site name next to it reads as two brand names. Note that "empty" differs from "unset": **unset**
  `SITE_NAME` shows the default `LLM 用量监控`, whereas only an **empty** value hides the text. When
  empty, the browser tab title falls back to the default name (an empty title is a blank tab).
- **Overlong names are truncated**: the brand slot ellipsises rather than pushing the navbar out of
  the viewport.

Two notes on logo themes:

- **Two images can be configured**: `SITE_LOGO_URL` (light) and `SITE_LOGO_URL_DARK` (dark). A dark
  wordmark on a dark navbar smears into a blob, so a "wordmark" logo is only complete when both are
  set. Switching themes swaps the image immediately (the other one is preloaded on first paint, so
  there is no loading gap that makes the site name jitter sideways).
- **Fallback is ordered**: if the image for the current theme is unset or fails to load, the other
  one is used; only when both are unusable does it fall back to plain text. Forgetting to configure
  the dark image does not blank the brand slot — it just has weaker contrast, which is easier to
  notice and fix.

Three notes on image URLs:

- **CORS does not apply**: the logo and favicon are loaded directly by the browser via `<img>` /
  `new Image()`. The server neither proxies them nor reads pixels — `crossorigin` is for reading
  back from a canvas, not for displaying. A cross-origin image host works fine.
- **https is mandatory**: an http resource on an https page is blocked as mixed content, which
  looks like "configured but never visible". This is especially easy to hit with an intranet host.
- **Load failures degrade gracefully**: the logo first tries the other theme and only then falls
  back to text; a failed favicon keeps the bundled icon. Neither leaves a broken image, so a wrong
  URL will not break the page — you simply will not see your customisation.

The logo uses a **fixed height with adaptive width**, and both the height and the width cap shrink
at breakpoints:

| Breakpoint | Logo height | Width cap | Gap between brand slot and site name |
| ---------- | ----------- | --------- | ------------------------------------ |
| Desktop    | 24px        | 132px     | 12px                                 |
| Tablet     | 24px        | 108px     | 12px                                 |
| Phone      | 20px        | 72px      | 8px                                  |

The height is 24px rather than something larger because a typical logo is a horizontal lockup of
mark plus wordmark, and **the wordmark usually occupies only about 70% of the canvas height**: at a
28px box the wordmark renders at roughly 19px, larger than the 18px site name, so the two competing
wordmarks lose their hierarchy; at 24px the wordmark is about 16.6px and sits level with the site
name. The width cap, conversely, must be generous (phone: 72px ≈ 20px × 3.6), otherwise
`object-fit: contain` squashes the whole canvas down to the width and the wordmark gets smaller
still. See section 5 of `src/assets/layout.css`.

At **≤1199px** the navbar moves "updated at / next refresh" out of the navbar row and down to the
top of the content area (phones already did this): measured at a 768px viewport the navbar row has
no slack left and the site name gets squeezed to "AI…". Showing the time text one step later is what
lets the site name stay whole.

The refresh interval is clamped to 10–3600 seconds: `0` or a non-numeric value falls back to the
default 180 seconds (`setInterval(fn, 0)` degrades into a busy loop running as fast as possible,
turning "auto refresh" into hammering upstream), and out-of-range values are clamped to the nearest
bound. Pausing while the page is hidden is unaffected by this variable.

### How to obtain a New API token (`NEWAPI_TOKEN`)

The variable is called `TOKEN` rather than `KEY` because the field expects a **system access
token**, not the `sk-`-prefixed **model invocation key** from the console. Both authenticate
against the site, but their permissions differ, and filling in the wrong one looks like "configured
yet never able to read data":

- **System access token (recommended)**: log into your New API site → "Personal settings → Security
  settings → System access token" → generate, and paste the whole token into `NEWAPI_TOKEN`. It can
  read the management API and yields the most complete card fields. Official docs:
  <https://docs.newapi.ai/zh/docs/api/management/auth>
- **Model invocation key (`sk-…`, usable but not recommended)**: when the program sees a 401 from
  the management API it automatically falls back to the OpenAI-compatible billing endpoints
  (`/v1/dashboard/billing/*`). The readings are still correct, but the username and per-model
  breakdown are unavailable.

### How to read New API currency units (no longer hardcoded to USD)

Different sites bill `quota` in different units (USD credits, CNY credits, custom tokens), so
readings cannot all be shown as `$`. The program first calls the site's **public endpoint**
`GET {baseUrl}/api/status` (no auth needed) to learn the unit type and conversion parameters, then
converts according to the site's own convention — the rules are copied from the official
`setting/operation_setting/general_setting.go` and `logger.LogQuota`:

| `quota_display_type` | Symbol                   | Conversion                                               |
| -------------------- | ------------------------ | -------------------------------------------------------- |
| `USD` (site default) | `$`                      | `quota / quota_per_unit`                                 |
| `CNY`                | `¥`                      | `quota / quota_per_unit × usd_exchange_rate`             |
| `CUSTOM`             | `custom_currency_symbol` | `quota / quota_per_unit × custom_currency_exchange_rate` |
| `TOKENS`             | `点`                     | raw `quota` (no conversion)                              |

A conversion factor ≤ 0 is treated as `1`, and an empty symbol as `¤`. When `/api/status` is
unavailable (the site disabled it or fields are missing) the code falls back to the official
default, **USD** — the official default display type is USD anyway.

> To probe the currency unit, look at `/api/status`; the `GET /api/pricing` endpoint in the official
> docs only has a model price list and **carries no currency information**.

### Alibaba Cloud Bailian Token Plan permissions

- The **organisation/seat view** (team edition) uses the ModelStudio OpenAPI (ROA + AK/SK) and only
  needs `AliyunTokenPlanReadOnlyAccess`.
- **Personal-edition usage** (5-hour/7-day windows, subscription status, add-on packs, reset cards)
  has **no official public API callable with AK/SK**: measured against
  `GET https://dashscope.aliyuncs.com/api/v1/tokenplan/*` (Bearer API key), the gateway currently
  returns an empty body with 404 (the route is unregistered, not an auth failure). The project
  offers two equivalent channels, **preferring the cookie**:

  1. **Console session cookie (recommended, works out of the box)** — exactly what the Bailian
     console page itself sends:
     `POST https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=…`
     authenticated by cookie. After logging into <https://bailian.console.aliyun.com>, go to
     DevTools → Application → Cookies → `bailian.console.aliyun.com`, copy the value of
     **`login_aliyunid_ticket`** and put it in `ALIYUN_TOKENPLAN_COOKIE` (measurements show this one
     cookie is sufficient; other cookies and Origin/Referer are not required).
     **No AK/SK and no RAM authorisation are needed**; when the session expires (usually after a few
     weeks) just copy it again. It also works on its own — such an account shows "session cookie
     only" and the organisation/seat section hides itself.
     **See "How to fill in cookies" below for the exact value format — getting it wrong corrupts the
     value silently and produces an error identical to an expired session.**

  2. **AK/SK channel** (the equivalent of the official CLI's `bl usage token-plan`, ported natively
     with no subprocess): AK/SK call `GenerateCLIAccessToken` with `ACS3-HMAC-SHA256` to obtain a
     console access token, then go through the console gateway to call
     `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/*`. This path requires the RAM sub-user to be
     granted the following custom policy:

  ```json
  {
    "Version": "1",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "modelstudio:GenerateCLIAccessToken",
        "Resource": "*"
      }
    ]
  }
  ```

  With neither a cookie nor that grant, the page shows a yellow notice at "personal-edition plan
  usage" while the organisation/seat view is unaffected.

### The two Alibaba Cloud credential sets coexist, they are not alternatives

`ALIYUN_ACCESS_KEY_ID` / `ALIYUN_SECRET_KEY` and `ALIYUN_TOKENPLAN_COOKIE` **each cover a different
piece of data and do not replace one another**:

| Displayed content                                              | Credential required                                                                 | Consequence if missing                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Bailian token resource pack instances (the `/api/usage` slice) | `ALIYUN_ACCESS_KEY_ID` + `ALIYUN_SECRET_KEY` (BSS)                                  | That slice returns `NOT_CONFIGURED` and the resource pack section is hidden |
| Token Plan organisation / seats / shared packs                 | Same as above (ModelStudio ROA)                                                     | The organisation/seat section is hidden                                     |
| Token Plan **personal edition** usage                          | `ALIYUN_TOKENPLAN_COOKIE` (**or** AK/SK plus the extra RAM grant; cookie preferred) | A yellow notice appears at "personal-edition plan usage"                    |

In short:

- **Adding a cookie does not replace AK/SK**; they cover different data. The same number is treated
  as the same account and produces one card.
- **Do not delete the AK/SK**: doing so loses both the token resource packs and the
  organisation/seats sections.
- **Cookie only also works**: personal-edition usage can be queried on its own and the
  organisation/seat section hides itself.
- Multiple accounts pair one-to-one by number: `ALIYUN_ACCESS_KEY_ID_2` and
  `ALIYUN_TOKENPLAN_COOKIE_2` refer to the same account.

### How to fill in cookies

The variable accepts two forms (a bare ticket value, or a whole `Cookie` header `a=b; c=d`), but the
two fare differently across environments:

| Environment                                 | Whole `Cookie` header         | Reason                                                                                                                                   |
| ------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel / EdgeOne Makers / Workers dashboard | ❌ rejected                   | The value contains `; `, and the dashboard reports "variable values may not contain special characters such as spaces, newlines or tabs" |
| Local `.env` / `.dev.vars`                  | ✅ works, but must be escaped | The loader expands `$`, see below                                                                                                        |

**Always paste just the value of `login_aliyunid_ticket`** — it contains no spaces or newlines, so
every platform stores it verbatim, and the server normalises it to `login_aliyunid_ticket=<value>`
automatically (adding the `name=` prefix when the bare value lacks it).

#### Local `.env`: a literal `$` must be written `\$`, or it corrupts silently

Bun's `.env` loader and Vite's `loadEnv()` (which `vite.config.ts` uses) **both perform `$VAR`
expansion**. The ticket value contains `$` (in the form `…M_1t$w3j6$SFnA3gvT*…`), and when
unescaped those segments are treated as variable names and **expand silently to nothing** — measured
at 153 characters of ticket shrinking to 130, 23 characters lost, with no warning at all.

```bash
# ❌ wrong: $w3j6 and $SFnA3gvHMS14Yv8bT are expanded away
ALIYUN_TOKENPLAN_COOKIE=…M_1t$w3j6$SFnA3gvHMS14Yv8bT*…

# ✅ correct: backslash every literal $
ALIYUN_TOKENPLAN_COOKIE=…M_1t\$w3j6\$SFnA3gvHMS14Yv8bT*…
```

A corrupted value sent to the gateway only ever returns `BailianGateway.Login.NotLogined` — **exactly
the same error as an expired session**, which makes it very easy to misdiagnose as an invalid
cookie. Note that **quoting (`"…"` / `'…'`) does not help in either loader; you must use `\$`**.

On platforms (Vercel / EdgeOne / Workers dashboards) **paste the raw value with no backslash** —
there is no expansion there.

Self-check (run from the repository root; `bun -e` loads `.env` automatically):

```bash
bun -e 'console.log(process.env.ALIYUN_TOKENPLAN_COOKIE?.length ?? "not set")'
```

The length printed should match what you copied from the browser; **a noticeably shorter value means
`$` was expanded away**.

#### A whole cookie (Gitee AI) on a platform dashboard: paste the `encodeURIComponent` value

Bailian can sidestep the space restriction by pasting only the ticket value, but **Gitee AI cannot**
— coupon lookup needs the entire session cookie (`uuser_locale=zh-CN; abymg_id=…; BEC=…` and so
on), which inherently contains `; ` and will always be rejected by a dashboard.

The solution is to **store the encoded value**: spaces become `%20` and semicolons `%3B`, leaving no
spaces or newlines for the dashboard to object to. The server's `normalizeSessionCookie()` in
`server/gitee.ts` detects a value containing `%` that decodes to something containing `=` and
restores it automatically, so business code always receives the original cookie string with no
extra configuration.

```bash
# single quotes preserve the spaces; printf adds no trailing newline (echo would write \n, which
# the dashboard also rejects)
COOKIE='uuser_locale=zh-CN; abymg_id=…; BEC=…'
printf '%s' "$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$COOKIE")" \
  | vercel env add GITEE_AI_SESSION_COOKIE production
```

Replacing only the spaces with `%20` and leaving the semicolons alone also works (the heuristic only
checks "contains `%` and decodes to something containing `=`"). A local `.env` accepts both forms;
**do not** add `\$` (the dashboard/`.env` difference is described in the previous section).

Self-check (after decoding you should see the whole string with `; `, matching the browser):

```bash
bun -e 'console.log(decodeURIComponent(process.env.GITEE_AI_SESSION_COOKIE ?? ""))'
```

## Common commands

```bash
bun run dev            # single-process dev: frontend on 5173 + built-in API (reads .env)
bun run dev:all        # run frontend and backend separately (backend on 8787)
bun run server         # production Bun server only (API + dist/ static page on one port)
```

**Run all four gates in order before committing** (CI uses the same order, see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
bun run test:unit      # 1. Vitest: signature vectors / multi-account reads / per-platform zod parsing / component contracts
bun run build          # 2. vue-tsc strict type checking + Rolldown build
bun run test:e2e       # 3. Playwright smoke: empty states / responsiveness / dark mode / back-to-top (starts vp dev)
bunx vp check          # 4. Oxfmt + Oxlint + tsgolint — this one must run last
```

All four in one command (the order is fixed and any failure aborts):

```bash
bun run check
```

`vp check` runs last for a reason: it even enforces **Markdown table alignment**, so it will touch
files you just edited one more time. When it reports formatting problems use
`bunx vp check --fix`, then **run it again** to confirm 0 errors and 0 warnings.

> After changing any `.vue` file, the `build` gate is **mandatory** — `vp check` does no template
> type checking, and relying on it alone will let type errors into the repository. See
> [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Repository layout

```
server/           platform-agnostic API core + Bun entry point
  app.ts          createAppHandler(env): the three endpoints (/api/status + /api/usage + /api/volc/inference-usage)
  cache.ts        TTL cache + single-flight for upstream queries (turns cache hits into zero upstream calls)
  index.ts        Bun entry: Bun.serve + static serving of dist/
  multi.ts        multi-account credential reading (PREFIX / PREFIX_2 / ...)
  sign.ts         Volcano Engine v4 signature (Web Crypto)
  volc.ts         Ark control-plane API client (GetPersonalPlan / GetAFPUsage / GetCodingPlanUsage / GetUsageDetails / GetInferenceUsage)
  deepseek.ts     DeepSeek balance client
  zhipu.ts        Zhipu client (Coding Plan quotas / account balance / resource packs)
  gitee.ts        Gitee AI resource pack balance client
  aliyun.ts       Alibaba Cloud RPC/ROA signature + BSS resource pack client
  aliyun-console.ts Bailian console gateway (Token Plan personal usage: session cookie / AK-SK dual channel + ACS3 signature)
  tokenplan.ts    Alibaba Model Studio Token Plan client (organisation/seats/shared packs)
  opencode.ts     OpenCode Go subscription quota client (rolling/weekly/monthly + window status)
  newapi.ts       New API (self-hosted gateway) client: management API first, billing API fallback, subscription/wallet mode detection
  balances.ts     OpenRouter balance client
  plans.ts        Kimi / MiniMax Token Plan client
src/              Vue 3 frontend (TDesign Vue Next + Pinia + Zod)
  api.ts          frontend API client (zod validation of the error envelope)
  stores/         Pinia stores (dashboard data orchestration / theme dark mode)
  types.ts        shared types (multi-account AccountEnvelope discriminated union + the unified AccountDetail model)
  detail.ts       building blocks of the detail model (field/metric/table/notice/link/windowQuota/cardsOf …)
  utils.ts        display formatting helpers + column-strategy predicates (shouldSpanFullRow /
                  isCompactAccounts / metricGridClass / windowContainerClass) + platform card ordering
  modelDocs.ts    platform name → official "available models" doc URL (the link beside card titles, keyword matched)
  components/     per-platform section components (AccountSection as the shared shell)
                  Plans tab: PlansSection, one card per platform (Kimi / MiniMax / OpenCode Go)
                  Balance tab: NewApiSection (New API sites; subscription and wallet readings coexist, links built per site)
    ui/           shared render skeletons (AccountCard / AccountCardBody / AccountDetailPanel /
                  DetailSection / DetailFields / DetailTable / MetricTile / UsageBar)
    *Detail.ts    one adapter per platform: raw platform response → AccountDetail (sections only map, never pick fields)
  assets/layout.css the single site-wide layout layer (semantic grid primitives + breakpoints; components declare none)
                  Navbar: at ≤767px it folds into two rows (brand+actions / three tabs split evenly),
                  with --app-menu-h and the anchor offset kept in sync
                  "Fill every layer" contract: section card → account card → window block, each eating the height left by its parent
                  Dialog geometry: placement="center" decides screen centring (TDesign's default top = 20vh from the viewport top),
                  with width/height floors and internal body scrolling in section 5 of the same file
e2e/              Playwright E2E smoke tests
worker/           Cloudflare Workers entry (reuses server/app.ts)
cloud-functions/  EdgeOne Makers cloud functions (catch-all /api/* + /api/diag self-diagnostic)
docs/design-baseline.md  design system specification (token discipline / precision model / column strategy / AccountDetail model)
docs/images/      README screenshots
docs/             provider API research (Alibaba Token Plan / Gitee AI coupons / CC-Switch usage-query survey)
.github/          CI (the four gates) + issue / PR templates + Dependabot
```

The repository root also holds [`LICENSE`](LICENSE), [`SECURITY.md`](SECURITY.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), plus the two
environment templates `.env.example` and `.dev.vars.example`.

## Security

### ⚠️ This project has no built-in user system or access control

Once deployed to the public internet, **anyone who knows the URL can see the balances and usage of
every account you configured**. In production, add authentication at the reverse proxy
(Cloudflare Access / Basic Auth / an IP allowlist), or simply deploy it on an internal network only.

### Credentials live on the server only

The frontend is a purely static page. Third-party keys, cookies and tokens are read only from
server-side environment variables and are **never sent to the browser** (the page renders masks
only). Use the least-privilege setups recommended above: an IAM sub-user for Volcano, a RAM
sub-user for Alibaba Cloud. Never put root-account keys in.

### Reporting vulnerabilities

**Do not** open a public issue. Use GitHub's private channel:

> **Security → Advisories → [Report a vulnerability](https://github.com/KS-OTO/tracking-llm-plan-usage/security/advisories/new)**

The threat model (what counts as a vulnerability and what does not), response times and this
repository's own credential discipline are all documented in [`SECURITY.md`](SECURITY.md).

If you find real credentials **anywhere in this repository, including in historical commits**,
treat it as a credential leak too — a leak in history is still a leak.

## Contributing

Issues and pull requests are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before you start;
the essentials are:

- **Environment**: Bun 1.2+ and Node `^22.18.0 || >=24.12.0`
- **The four gates**: `test:unit` → `build` → `test:e2e` → `vp check`, fixed order, all green
- **Code ground rules**: use TDesign's native tokens only (no parallel `--ui-*` layer); layout only
  through the semantic primitives in `src/assets/layout.css` (components declare no breakpoints and
  never use `t-row`/`t-col`); column strategy is applied centrally by `App.vue` based on item
  counts; `<t-statistic>` may only appear in `MetricTile.vue`
- **Credential discipline**: never paste a real key, cookie or token into any committed file; test
  fixtures always use placeholder values

Commit messages are written in Chinese in the form `<type>: <conclusion>`, with the body explaining
**why**. Design decisions belong in [`docs/design-baseline.md`](docs/design-baseline.md), not only
in the pull request description.

## References

- DeepSeek balance query: <https://api-docs.deepseek.com/zh-cn/api/get-user-balance/>
- Volcano Ark base URL and auth: <https://console.volcengine.com/ark/region:cn-beijing/docs/82379/1298459?lang=zh>
- GetPersonalPlan: <https://console.volcengine.com/ark/region:cn-beijing/docs/ark/get-personal-plan-api?lang=zh>
- GetAFPUsage: <https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2479847?lang=zh>
- GetUsageDetails: <https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2479849?lang=zh>
- GetInferenceUsage: <https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2116766?lang=zh>
- Agent Plan quota semantics (the "daily quota" only applies to image/video/voice models and Harness): <https://www.volcengine.com/docs/82379/2366394>
- Volcano Engine signature method: <https://www.volcengine.com/docs/6369/67269>
- Bailian CLI (official; source of the Token Plan usage implementation): <https://github.com/modelstudioai/cli>
- Bailian console Token Plan personal page (source of the cookie-channel requests): <https://bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal>
- Bailian CLI usage and quota docs: <https://docs.bailian.console.aliyun.com/zh/model-studio/cli/usage-quota>
- Bailian Token Plan OpenAPI series (not currently exposed by the gateway; measured 404): <https://docs.bailian.console.aliyun.com/zh/model-studio/get-subscription-stats>
- New API management API auth: <https://docs.newapi.ai/zh/docs/api/management/auth>
- New API usage statistics (by model): <https://docs.newapi.ai/zh/docs/api/management/statistics/data-self-get>
- New API log statistics: <https://docs.newapi.ai/zh/docs/api/management/logs/log-self-stat-get>
- New API source (source of the subscription/wallet field definitions): <https://github.com/QuantumNous/new-api>
- OpenCode Go usage reference implementation (cc-switch PR #6547): <https://github.com/farion1231/cc-switch/pull/6547>
- OpenCode Go usage endpoint and field semantics (`GET /zen/go/v1/usage`, window `status`/`percent`/`resetsAt`): <https://github.com/looplj/axonhub/pull/2204>

## License

[MIT](LICENSE) © 2026 KS-OTO

## Acknowledgements

- UI component library: [TDesign Vue Next](https://tdesign.tencent.com/vue-next/)
- Toolchain: [Vite+](https://viteplus.dev/) (Oxfmt / Oxlint / tsgolint / Vitest / Rolldown), [Bun](https://bun.sh)
- Volcano Engine signature implementation reference: [ByteDance official docs](https://www.volcengine.com/docs/6369/67269)
- Alibaba Bailian Token Plan usage implementation reference: [modelstudioai/cli](https://github.com/modelstudioai/cli)
- OpenCode Go usage semantics: [cc-switch PR #6547](https://github.com/farion1231/cc-switch/pull/6547), [axonhub PR #2204](https://github.com/looplj/axonhub/pull/2204)
- New API subscription / wallet field definitions: [QuantumNous/new-api](https://github.com/QuantumNous/new-api)
