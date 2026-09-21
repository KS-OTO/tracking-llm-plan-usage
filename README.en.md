# LLM Usage Monitor (tracking-llm-plan-usage)

[简体中文](README.md) | **English**

[![CI](https://github.com/KS-OTO/tracking-llm-plan-usage/actions/workflows/ci.yml/badge.svg)](https://github.com/KS-OTO/tracking-llm-plan-usage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2%2B-black?logo=bun)](https://bun.sh)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white)](https://vuejs.org)
[![TDesign Vue Next](https://img.shields.io/badge/TDesign-Vue%20Next-0052d9)](https://tdesign.tencent.com/vue-next/)
[![Node](https://img.shields.io/badge/Node-%5E22.18%20%7C%7C%20%3E%3D24.12-339933?logo=node.js&logoColor=white)](package.json)
[![Demo](https://img.shields.io/badge/Demo-cp--ai101.18bit.cn-2ea44f)](https://cp-ai101.18bit.cn/)
[![Docs](https://img.shields.io/badge/Docs-Wiki-0052d9?logo=github)](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki)

Balances and quota windows for **DeepSeek, Volcano Ark, Zhipu, Alibaba Cloud Bailian, Gitee AI,
Baidu Qianfan, OpenRouter, New API** (self-hosted gateway) and the **Kimi / MiniMax / OpenCode Go**
subscription plans — all on **one page**. Credentials live only in server-side environment
variables; the browser never receives a key.

> **Live demo: <https://cp-ai101.18bit.cn/>** ·
> **User manual (Wiki): <https://github.com/KS-OTO/tracking-llm-plan-usage/wiki>**

![Plans tab: quota-window bars with multiple keys side by side](docs/images/plans-dark.png)

<sub>The screenshot shows the "Plans" tab. The same screen in light mode is
[`plans-light.png`](docs/images/plans-light.png); the "Balance accounts" tab is
[`accounts-dark.png`](docs/images/accounts-dark.png).</sub>

> This English document is a translation of [`README.md`](README.md). If the two ever disagree,
> the Chinese version is authoritative.

## What this project is

Balances and quotas for these platforms are scattered across their respective consoles, and some
of them do not even expose a query API (only a browser session cookie works). Answering "will I
run out this month?" means logging into each console in turn. This project collapses that into
**one request, one page**, with every credential interaction happening server-side.

It is **not** a proxy gateway: it does not forward model requests and does not log your
conversations. It reads balances and usage, and nothing else.

It has **no** built-in user system: once deployed publicly, anyone who knows the URL can see your
readings. Production use requires authentication at the reverse proxy (see [Security](#security)).

## Quick start

```bash
git clone https://github.com/KS-OTO/tracking-llm-plan-usage.git
cd tracking-llm-plan-usage
bun install
cp .env.example .env      # fill in only the platforms you care about
bun run dev               # single process: frontend on 5173 + built-in API (reads .env)
```

Open <http://localhost:5173>.

**It runs with zero keys configured** — the page renders a neutral "not configured" state for every
platform instead of failing. Enter one variable and that card lights up; no code edits, no rebuild.

| What you want to do right now                   | Where to go                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Find the minimum set of variables to fill in    | [Getting started → light up your first card](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Getting-Started) |
| Look up what a variable means                   | [Configuration reference](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)                      |
| Configure cookies / multiple accounts / labels  | [Credentials & multiple accounts](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Credentials)                |
| Deploy it (Workers / EdgeOne / anything else)   | [Deployment](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)                                      |
| It will not start, a card is missing, "expired" | [Troubleshooting](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Troubleshooting)                            |

## Supported platforms

| Platform                   | What you see                                                                               | Credentials needed                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| DeepSeek                   | Total / topped-up / granted balance (CNY·USD), availability                                | `DEEPSEEK_API_KEY`                                                            |
| Volcano Ark Agent Plan     | 5-hour / weekly / monthly quotas and progress, reset countdown; plan tier, call details    | `VOLC_ACCESS_KEY_ID` + `VOLC_SECRET_KEY`                                      |
| Zhipu GLM                  | Coding Plan tier and 5-hour / weekly window quotas, balance, token resource packs          | `ZHIPU_API_KEY`                                                               |
| Alibaba Cloud Bailian      | Token resource packs (total / remaining / validity)                                        | `ALIYUN_ACCESS_KEY_ID` + `ALIYUN_SECRET_KEY`                                  |
| Alibaba Bailian Token Plan | Organisation / seats / shared packs; **personal edition** 5-hour / 7-day usage, add-ons    | Same as above (team edition); personal edition adds `ALIYUN_TOKENPLAN_COOKIE` |
| Gitee AI                   | Resource packs total / used / remaining, coupon balance and details                        | `GITEE_AI_API_KEY`; coupons need `GITEE_AI_SESSION_COOKIE`                    |
| Baidu Qianfan              | Volume packs (total / used / expiry), TPM quota, last-7-days overview                      | `BAIDU_ACCESS_KEY_ID` + `BAIDU_SECRET_KEY`                                    |
| OpenRouter                 | Remaining credit / limit remaining / today's usage; top-up and monthly usage in the dialog | `OPENROUTER_API_KEY`                                                          |
| New API (self-hosted)      | **Subscription** (period quota windows) or **wallet** (remaining / total used / requests)  | `NEWAPI_BASE_URL` + `NEWAPI_TOKEN` (add `_2` / `_3` for more)                 |
| Subscription plans         | Window-based subscription quotas for Kimi / MiniMax / OpenCode Go                          | `KIMI_API_KEY` / `MINIMAX_API_KEY` / `OPENCODE_GO_API_KEY`                    |

**Everything is optional**: configure the platforms you want and only those render. Keys exist only
in server-side environment variables, and the frontend only ever renders a mask. For per-platform
APIs, field semantics, measured behaviour and known limitations, see
[Providers](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Providers).

## Deployment

`server/app.ts` is platform-agnostic (it depends only on the Web Fetch API and Web Crypto), so any
platform offering "a single HTTP entry point plus environment variable injection" can host it.

| Platform                        | How                                                                        | Guide                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cloudflare Workers              | `bun run deploy` (= `vp build && wrangler deploy`); secrets via `wrangler` | [Deployment → Workers](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)         |
| EdgeOne Makers                  | Point the function directory at `cloud-functions/` in the console          | [Deployment → EdgeOne](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)         |
| Vercel / any Node host          | Write an `api/` adapter following `cloud-functions/api/[[default]].js`     | [Deployment → Other platforms](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment) |
| Your own machine / intranet box | `vp build` then `bun run server` — API and static page on one port         | [Deployment → Self-hosting](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)    |

Platform dashboards impose two hard constraints when setting variables (**values may not contain
spaces or newlines**, and **dashboards do not expand `$`**) — read
[How to fill in cookies](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Credentials) before
you configure anything. Changing a variable only takes effect **after a redeploy**.

> ⚠️ Read [Security](#security) before deploying publicly: this project has **no** built-in access
> control.

## Configuration

Every variable has a commented template in `.env.example`; `.env` holds your real values (gitignored,
never committed). The ones you will touch most:

| Variable                   | Notes                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `<platform>_API_KEY`       | Per-platform keys / AKs (see the table above) — **all optional**                         |
| `<platform>_LABEL`         | Account label; shown as the card heading when several keys are configured                |
| `SITE_NAME`                | Site name, defaults to "LLM 用量监控"; an **explicitly empty** value shows the logo only |
| `SITE_LOGO_URL`            | Light-mode logo URL (must be https)                                                      |
| `SITE_LOGO_URL_DARK`       | Dark-mode-only logo; falls back to `SITE_LOGO_URL` when unset                            |
| `SITE_FAVICON_URL`         | Browser tab icon (must be https)                                                         |
| `REFRESH_INTERVAL_SECONDS` | Frontend auto-refresh interval in seconds, default `180`, allowed range 10–3600          |

- **Full variable list** (including `HOST` / `PORT` / `NEWAPI_USER_ID` and the rest) →
  [Configuration reference](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)
- **Site customisation** (logo height and breakpoints, "empty vs unset", fallback behaviour) →
  [Site customisation](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)

Three traps worth stating up front:

1. **Multi-account numbering must be consecutive**: `PREFIX`, `PREFIX_2`, `PREFIX_3`… and reading
   **stops at the first gap**. Having `_1` and `_3` but no `_2` makes every later set unreadable.
   Paired credentials (access key / secret key) group by the same number.
2. **Labels pair by number, not by value**: `*_LABEL_2` refers to the second credential set.
3. **A local `.env` expands `$`**: a literal `$` must be written `\$` or the value is **corrupted
   silently** (quoting does not help). Dashboards are the opposite — paste the raw value and
   **do not** add a backslash.

The **single source of truth** for environment variables is `server/env-vars.ts`: adding a platform
means editing it, `.env.example` and `.dev.vars.example` together, and `server/env-vars.test.ts`
asserts there is no drift — so a "documented but ineffective" variable cannot happen.

## Features

- **Responsive multi-column layout**: multiple columns on desktop, two on tablet, one on phone;
  platforms are grouped under "Plans" / "Balance accounts" tabs. Layout is decided solely by the
  semantic grid primitives in `src/assets/layout.css` (components never declare breakpoints), and
  **every layer of card fills the height handed down to it**, so a section card → account card →
  quota-window block are strictly equal-height at all three levels. A section holding ≥2 keys
  automatically **takes a full row**, so keys sit side by side instead of collapsing into "one per
  line plus wrapping".
- **Cards carry only high-priority readings**: window usage, balances and status — the numbers you
  look at daily. Account identity, subscription metadata, detail tables and secondary metrics all
  live behind the "details" dialog in the card's top-right corner.
- **Platform card ordering**: platforms with more keys come first (3 > 2 > 1); ties break on the
  first letter of the platform name, A→Z — Chinese names romanised to pinyin and interleaved with
  Latin names in one sequence (Aliyun→A, Baidu→B, DeepSeek→D, OpenRouter→O, Zhipu→Z).
- **"Available models" links straight to the docs**: every platform card has an "Available models ↗"
  link opening that platform's official model/pricing documentation in a new tab. URLs are looked up
  by card title in `src/modelDocs.ts`, so a platform whose title differs between tabs still needs
  only one mapping.
- **Predictable refresh cadence**: the header shows both "updated at HH:MM:SS" and
  "next refresh HH:MM:SS"; when auto-refresh is off or the page moves to the background the latter
  reads "paused" — it never advertises a time that will not arrive.
- **Navigation never overflows on narrow screens**: at ≤767px the navbar folds into two rows (brand
  and actions together, the three tabs splitting the second row evenly) and the time text moves down
  to the top of the content area; the anchor offset follows the navbar's real height, so jumping to
  an anchor never hides the heading under the navbar.
- **Dark mode**: one-click toggle, persisted in `localStorage`, defaulting to the system
  `prefers-color-scheme`.
- **Accessibility**: semantic landmarks (header/main/footer), keyboard reachable, ARIA labelling.
  All five text tiers (link colour included) are checked against WCAG AA (≥4.5:1) in both modes;
  values live in `src/assets/theme.css`.
- **Skeletons / error alerts / empty states**: all carried by TDesign Skeleton / Alert / Empty.

### Only three endpoints

The page runs on edge clouds, and some platforms bill by **node lifetime** — the endpoint count
directly determines how often a node is woken and how long it lives. All readings are therefore
merged into three endpoints (down from thirteen):

| Endpoint                        | When it is called                         | Notes                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/status`               | Once on first paint                       | Returns **configuration state only** and makes **zero upstream calls**, so it is very fast                                                                              |
| `GET /api/usage`                | On every refresh                          | The readings of ten platforms merged into **one envelope**; each platform is an independent slice, so one failure never contaminates the other nine                     |
| `GET /api/volc/inference-usage` | On demand (when the model filter changes) | Volcano inference usage. **Deliberately not merged** — it is the only endpoint taking user input, and merging it would turn "change a filter" into "refetch everything" |

The server has a **TTL cache plus single-flight**: on a cache hit the upstream call count is 0, and
concurrent refreshes share one upstream request. Clicking "refresh" manually bypasses the cache
(`?refresh=1`), so a manual refresh always gets live data. Contracts, envelope shape and cache tiers
are in [Architecture](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Architecture).

## Development

```bash
bun run dev            # single-process dev: frontend 5173 + built-in API (reads .env)
bun run dev:all        # run frontend and backend separately (backend on 8787)
bun run server         # production Bun server only (API + dist/ on one port)
```

**Run all four gates in order before committing** (CI uses the same order, see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
bun run test:unit      # 1. Vitest: signature vectors / multi-account reads / per-platform zod parsing / component contracts
bun run build          # 2. vue-tsc strict type checking + Rolldown build
bun run test:e2e       # 3. Playwright smoke: empty states / responsiveness / dark mode / back-to-top
bunx vp check          # 4. Oxfmt + Oxlint + tsgolint — this one must run last
```

All four in one command (fixed order, any failure aborts): `bun run check`.

> After changing any `.vue` file the `build` gate is **mandatory** — `vp check` does no template type
> checking. `bunx vp check --fix` fixes formatting automatically, but **run it again** afterwards to
> confirm 0 errors and 0 warnings.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before you start (code ground rules, PR flow, credential
discipline) and put design decisions in [`docs/design-baseline.md`](docs/design-baseline.md). The
full development guide is in
[Development](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Development).

## Repository layout

```
server/           platform-agnostic API core + Bun entry point (app.ts / cache.ts / per-platform clients)
src/              Vue 3 frontend (TDesign Vue Next + Pinia)
  components/     per-platform section components + *Detail.ts adapters (response → AccountDetail)
  assets/layout.css  the single site-wide layout layer (semantic grid primitives + breakpoints)
  assets/theme.css   the single place colours are declared (overrides TDesign's --td-*, one set per mode)
e2e/              Playwright E2E smoke tests
worker/           Cloudflare Workers entry (reuses server/app.ts)
cloud-functions/  EdgeOne Makers cloud functions
docs/             design system specification + provider API research
.github/          CI (the four gates) + issue / PR templates + Dependabot
```

The repository root also holds [`LICENSE`](LICENSE), [`SECURITY.md`](SECURITY.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), plus the
environment templates `.env.example` and `.dev.vars.example`. File-by-file detail is in
[Architecture → Repository layout](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Architecture).

## Security

### ⚠️ This project has no built-in user system or access control

Once deployed to the public internet, **anyone who knows the URL can see the balances and usage of
every account you configured**. In production, add authentication at the reverse proxy
(Cloudflare Access / Basic Auth / an IP allowlist), or simply deploy it on an internal network only.

### Credentials live on the server only

The frontend is a purely static page. Third-party keys, cookies and tokens are read only from
server-side environment variables and are **never sent to the browser** (the page renders masks
only). Use least privilege: an IAM sub-user for Volcano, a RAM sub-user for Alibaba Cloud. Never put
root-account keys in.

### Reporting vulnerabilities

**Do not** open a public issue. Use GitHub's private channel: Security → Advisories →
[Report a vulnerability](https://github.com/KS-OTO/tracking-llm-plan-usage/security/advisories/new).
The threat model, response times and this repository's own credential discipline are documented in
[`SECURITY.md`](SECURITY.md) and
[Security](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Security).

If you find real credentials **anywhere in this repository, including in historical commits**,
treat it as a credential leak too — a leak in history is still a leak.

## Documentation

| Document                                                                                              | Contents                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Getting started](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Getting-Started)             | Run it locally, configure your first platform, see the first card   |
| [Configuration](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Configuration)                 | Every environment variable, site customisation, refresh interval    |
| [Credentials & multiple accounts](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Credentials) | Cookies, `$` escaping, account numbering, labels, permissions       |
| [Deployment](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Deployment)                       | Workers / EdgeOne / Vercel / self-hosting, dashboard constraints    |
| [Providers](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Providers)                         | Per-platform APIs, field semantics, measurements, limitations       |
| [Architecture](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Architecture)                   | The three endpoints, error envelope, cache tiers, repository layout |
| [Development](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Development)                     | Environment, gates, code ground rules, PR flow, test conventions    |
| [Design system](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Design-System)                 | Token discipline, number precision model, column strategy, theming  |
| [Security](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Security)                           | Threat model, the credential boundary, reporting vulnerabilities    |
| [Troubleshooting](https://github.com/KS-OTO/tracking-llm-plan-usage/wiki/Troubleshooting)             | Won't start / card missing / "expired" session / dashboard rejects  |
| [`docs/design-baseline.md`](docs/design-baseline.md)                                                  | The authoritative design specification (evolves with the code)      |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md)                                   | Contributing and security (in-repo, reviewed with the code)         |

## License

[MIT](LICENSE) © 2026 KS-OTO

## Acknowledgements

- UI component library: [TDesign Vue Next](https://tdesign.tencent.com/vue-next/)
- Toolchain: [Vite+](https://viteplus.dev/) (Oxfmt / Oxlint / tsgolint / Vitest / Rolldown), [Bun](https://bun.sh)
- Volcano Engine signature implementation reference: [ByteDance official docs](https://www.volcengine.com/docs/6369/67269)
- Alibaba Bailian Token Plan usage implementation reference: [modelstudioai/cli](https://github.com/modelstudioai/cli)
- OpenCode Go usage semantics: [cc-switch PR #6547](https://github.com/farion1231/cc-switch/pull/6547), [axonhub PR #2204](https://github.com/looplj/axonhub/pull/2204)
- New API subscription / wallet field definitions: [QuantumNous/new-api](https://github.com/QuantumNous/new-api)

This project is not affiliated with or endorsed by any of the platforms above. Their APIs, fields
and terms may change at any time; this project only performs read-only queries and never manages
your accounts.
