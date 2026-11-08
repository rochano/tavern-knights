# Deploy: staging → production

The site is on Cloudflare Pages, connected to this repo. Every branch push deploys by itself.

| Environment | Branch | URL | Who pushes |
|---|---|---|---|
| **Production** | `main` | https://tavern-knights.pages.dev | Only by merging a PR from `staging`, after the owner approves |
| **Staging** | `staging` | https://staging.tavern-knights.pages.dev | All new work lands here first |
| Previews | any other branch (e.g. `claude/...`) | `https://<branch-name>.tavern-knights.pages.dev` (slashes become `-`) | Optional, for one-off checks |

Cloudflare marks every non-production deploy `X-Robots-Tag: noindex`, so staging and previews do not show up in Google.

## Workflow

1. Work on a feature branch (or straight on `staging` for small fixes).
2. Merge / push into `staging`. Wait ~1 minute, then test on https://staging.tavern-knights.pages.dev (phone + desktop, Thai + English).
3. When the owner says it is OK, open a PR **`staging` → `main`** (title: what changed since the last release).
4. The owner merges that PR. Cloudflare deploys production.

Never push directly to `main`. If production needs an urgent hotfix, fix it on `staging` first and release with the same PR flow.

After a release, `staging` and `main` are identical. If `main` ever gets a commit that `staging` lacks, merge `main` back into `staging`.

## Backend (Workers + database), when it arrives

Keep staging and production fully separate so testing never touches real players' scores or purchases:

- One `wrangler.toml` with `[env.staging]` and `[env.production]`. Each env has its own Worker name (`tavern-knights-api-staging` / `tavern-knights-api`), its own D1/KV binding IDs and its own secrets (`wrangler secret put X --env staging`).
- Deploy with `wrangler deploy --env staging` from the `staging` branch and `--env production` from `main` only (GitHub Actions, gated on branch).
- Payments (shop) use the provider's **test** keys on staging and live keys only on production.
- The game picks the API by hostname: `tavern-knights.pages.dev` → production API, anything else (staging, previews, localhost) → staging API.
- Database schema changes (D1 migrations) run on staging first, then on production in the same release PR.
