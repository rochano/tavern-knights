# Deploy: staging → production

The site is on Cloudflare Pages, connected to this repo. Every branch push deploys by itself.

| Environment | Branch | URL | Who pushes |
|---|---|---|---|
| **Production** | `main` | https://tavern-knights.pages.dev | Only by merging a PR from `develop`, after the owner approves |
| **Staging (develop)** | `develop` | https://develop.tavern-knights.pages.dev | All new work lands here first |
| Previews | any other branch (e.g. `claude/...`) | `https://<branch-name>.tavern-knights.pages.dev` (slashes become `-`) | Optional, for one-off checks |

Cloudflare marks every non-production deploy `X-Robots-Tag: noindex`, so staging and previews do not show up in Google.

## Build settings (Angular)

The site is built by Cloudflare Pages from `package.json` (npm workspaces: `client`, `server`, `shared`). Set once in **Workers & Pages → tavern-knights → Settings → Build**:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `client/dist/browser` |

Node version comes from `.node-version`. Functions are always read from the repo's root `functions/` folder.

## Workflow

1. Work on a feature branch (or straight on `develop` for small fixes).
2. Merge / push into `develop`. Wait ~1 minute, then test on https://develop.tavern-knights.pages.dev (phone + desktop, Thai + English).
3. When the owner says it is OK, open a PR **`develop` → `main`** (title: what changed since the last release).
4. The owner merges that PR. Cloudflare deploys production.

Never push directly to `main`. If production needs an urgent hotfix, fix it on `develop` first and release with the same PR flow.

After a release, `develop` and `main` are identical. If `main` ever gets a commit that `develop` lacks, merge `main` back into `develop`.

## Backend (online ranking)

The API lives in `server/src/app.ts` (Hono + TypeScript, types shared with the client in `shared/src/api.ts`); `functions/api/[[route]].ts` is its Pages entry. It is a Cloudflare **Pages Function**, so it deploys together with the site on every push: no separate Worker, no API token in GitHub. The game calls `/api/v1/...` on its own domain, so develop talks to the staging database and production talks to the production database. The store apps (Capacitor/Electron, `app://`) call production.

Staging and production stay fully separate through the Pages project's bindings:

1. Cloudflare dashboard → **Storage & Databases → D1** → create two databases: `tavern-knights-dev` and `tavern-knights-prod`.
2. **Workers & Pages → tavern-knights → Settings → Bindings → Add → D1 database**, variable name **`DB`**:
   - **Preview** environment (develop and every other branch) → `tavern-knights-dev`
   - **Production** environment (main) → `tavern-knights-prod`
3. Redeploy develop (push any commit, or "Retry deployment" on the latest develop deploy).

Tables are created on the first request (`server/migrations/0001_ranking.sql` records the same schema), so there is no migration step yet. Until the binding exists the API answers `503 ranking_offline` and the game hides the online lines; check with `/api/v1/health` (`"db": true` once it is bound).

Endpoints: `POST auth/guest`, `GET me`, `POST me/name`, `POST runs/start`, `POST runs/finish`, `GET boards/{stage1_score|stage1_time|tavern_gold}?period=week|all`. Weeks follow Thai time (UTC+7) and start on Monday.

## Shop and advisor (full version only)

The shop and Old Bart's advisor show only in the full version (store builds with `window.TK_FULL = true`, the develop site, localhost). The free web demo never shows them.

- Coins ("Dragon Coins") live only in the database: `coin_ledger` has one row per change, the balance is the sum. Purchases take coins in one conditional statement, so a double tap can't spend the same coins twice.
- Catalog: `SHOP` in `shared/src/api.ts` (cosmetic looks that reuse the outfit-tier art, a gold pouch, an ingredient crate). Prices and items change there.
- Endpoints: `GET wallet`, `POST shop/buy`, `POST shop/claim`, `POST ai/ask`, `POST dev/coins` (test coins, develop/localhost only, up to 500).
- There are no real payments yet. Coin packs come with in-app payments (phase 4).

To turn the advisor on, add a secret in **Settings → Variables and Secrets**:

| Name | Where | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` (secret) | Preview first, Production when approved | a Claude API key from console.anthropic.com |
| `AI_MONTHLY_LIMIT` (optional) | both | most answers per month for the whole game, default 3000 |
| `AI_MODEL_HINT` / `AI_MODEL_COACH` (optional) | both | model ids, default `claude-haiku-5-5` / `claude-opus-5-5` |

Without the key the advisor says it is closed and takes no coins. If Claude fails to answer, the coins are refunded. Also set a monthly spend limit in the Anthropic Console.

Payment keys later go in the same place: **test** keys on Preview, live keys on Production only. When schema changes start, add numbered SQL files under `server/migrations/` and run them on the dev database first, then on prod in the same release PR.

Local test: `npm install && npm run dev:api` builds the client and serves it with the API and a local database on http://localhost:8788.
