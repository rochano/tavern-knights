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

Later phases (shop, AI credits): payment keys go in Settings → Variables and Secrets, **test** keys on Preview, live keys on Production only. When schema changes start, add numbered SQL files under `server/migrations/` and run them on the dev database first, then on prod in the same release PR.

Local test: `npm install && npm run dev:api` builds the client and serves it with the API and a local database on http://localhost:8788.
