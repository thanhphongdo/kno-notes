# Deploying Kno-Notes

Vercel project **`kno-notes`** · production domain **`kno-notes.vercel.app`**

Everything below stays inside a free tier. There is nothing to pay for:

| Component | Service | Free allowance used |
|---|---|---|
| Hosting + serverless functions | Vercel **Hobby** | 100 GB bandwidth/month, functions up to 60 s |
| Queryable index (`users`, `note_index`, `tags`, `api_keys`, `user_prefs`) | **Neon** free (via Vercel Postgres) | 0.5 GB storage, autosuspends when idle |
| Note JSON + image bytes | **private GitHub repo** via the Contents API | no per-request cost, free version history |
| Quiz generation | **Google Gemini** free tier — *optional* | falls back to a fully offline generator |
| Vector search | `transformers.js` **in the browser** + IndexedDB | no server cost at all |

**No Redis, no S3, no Vercel Blob/KV, no Algolia/Pinecone, no Auth0/Clerk.**
Auth is self-hosted (`bcryptjs` + `jose`), rate limiting is in-process, and the
embedding model runs on the user's device.

---

## 0. Prerequisites

```bash
node --version        # >= 20.9
npm install
vercel --version      # npm i -g vercel
gh --version          # optional, used in step 2
```

---

## 1. Create the Neon database and get `DATABASE_URL`

Vercel dashboard → your project → **Storage** → **Create Database** → **Neon**
(free plan). Pick the region closest to `sin1` (Singapore) so the app and the
database stay on one continent.

Vercel injects `DATABASE_URL` into the project automatically. Use the **pooled**
connection string — it ends in `.neon.tech` and usually contains `-pooler`.

To copy it locally:

```bash
vercel env pull .env.production.local
grep DATABASE_URL .env.production.local
```

> **Why the host matters.** `src/lib/db/index.ts` picks its driver from the
> hostname: anything ending in `.neon.tech` uses `@neondatabase/serverless`
> over HTTP; anything else (i.e. `localhost`) uses `pg` over TCP. The Neon HTTP
> driver physically cannot reach a local Postgres server, so do not hand it a
> `localhost` URL, and do not hand `pg` a Neon URL expecting HTTP pooling.

---

## 2. Create the private data repository

Notes and images live in a **separate private GitHub repo**, not in the app repo.

```bash
gh repo create kno-notes-data --private --description "Kno-Notes user data"
```

Leave it empty. The app creates `data/users/<userId>/notes/*.json` and
`data/users/<userId>/images/*` on the first write.

> **Why GitHub and not Vercel Blob.** Blob on Hobby is a *metered* product
> (1 GB store, 10 GB/month bandwidth) that starts billing past the included
> amount. A private repo has no per-request bill, gives you free version history
> for every single write, and stays readable and editable outside the app.

---

## 3. Create the PAT — least privilege, deliberately

Use a **fine-grained** personal access token, not a classic one. A classic
`repo`-scoped token can read and write **every** repository you own; this token
only ever needs to touch one repo, so give it exactly that:

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token

- **Repository access:** *Only select repositories* → **`kno-notes-data`** and nothing else
- **Permissions:** *Repository permissions* → **Contents: Read and write**
  (leave every other permission at *No access* — the app never reads issues,
  actions, packages, metadata beyond the default, or any other repo)
- **Expiration:** set one, and put a calendar reminder to rotate it

Copy the token immediately — GitHub shows it once.

---

## 4. Generate `AUTH_SECRET`

```bash
openssl rand -base64 32
```

This signs the `kn_session` JWT (HS256, 30-day expiry). It must be **at least
32 characters**; `scripts/check-env.ts` reports it as missing if it is shorter. Changing
it later invalidates every existing session, which is the intended way to force
a global sign-out.

---

## 5. Set the environment variables

Vercel → Settings → **Environment Variables**. Add these to **Production** and
**Preview**.

### Required — the app will not work without these

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string | must end in `.neon.tech` in production |
| `AUTH_SECRET` | `openssl rand -base64 32` | ≥ 32 characters, or the env check fails |
| `GITHUB_TOKEN` | the fine-grained PAT from step 3 | **required in production** — see the warning below |
| `GITHUB_OWNER` | your GitHub username or org | |
| `GITHUB_REPO` | `kno-notes-data` | |

> ⚠️ **All three `GITHUB_*` variables must be set together.** `getStorage()`
> returns the GitHub adapter only when `GITHUB_TOKEN`, `GITHUB_OWNER` **and**
> `GITHUB_REPO` are all present; otherwise it silently falls back to the
> filesystem adapter. On Vercel the filesystem is ephemeral, so **every note
> would be lost on the next cold start.** Locally the fallback is exactly what
> you want; in production it is data loss. `npx tsx scripts/check-env.ts` prints
> which adapter is selected — check it before you ship.

### Optional — sensible defaults if omitted

| Variable | Default | What changes if you omit it |
|---|---|---|
| `GITHUB_BRANCH` | `main` | the branch notes are committed to |
| `GOOGLE_GENERATIVE_AI_API_KEY` | *(none)* | see below |
| `NEXT_PUBLIC_APP_NAME` | `Kno-Notes` | the name shown in the UI |
| `DATA_DIR` | `.data` | filesystem adapter root; dev/test only |
| `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH` | *(unset)* | set to `1` to skip the embedding worker (CI, Playwright) |

**What degrades without `GOOGLE_GENERATIVE_AI_API_KEY`:** nothing breaks. Quiz
generation skips the Gemini branch entirely — no client is constructed and no
network call is made — and `offlineQuiz()` builds questions from the note's own
`<h2>`/`<h3>` sections plus distractors drawn from the user's other notes. The
response says `source: "offline"` instead of `source: "ai"`. The questions are
more mechanical ("which of these belongs under heading X?") but real and
useful. Any Gemini failure — quota, network, malformed JSON, fewer than three
valid questions — falls through to the same offline path, so the user never
sees a 5xx for a quiz. Get a free key at <https://aistudio.google.com> if you
want the better questions.

Verify before deploying:

```bash
npx tsx scripts/check-env.ts
```

It prints the chosen DB driver, storage adapter and quiz source, and exits 1 if
anything required is missing or malformed. To run it against the production
values, `vercel env pull .env.production.local` first and re-run with that file
loaded.

---

## 6. Deploy

Migrate the production schema first, then deploy:

```bash
DATABASE_URL="<neon pooled url>" npm run db:migrate
vercel link --project kno-notes
vercel --prod
```

Drizzle records applied migrations in `__drizzle_migrations` and skips them on
re-run, so `db:migrate` is safe to repeat and safe to run against a database
that is already up to date.

**Optional — migrate automatically on every deploy.** Add this script to
`package.json` and Vercel will run it instead of `next build`:

```json
"vercel-build": "tsx scripts/migrate.ts && next build"
```

That removes the "forgot to migrate" failure mode entirely. Without it, remember
to run `npm run db:migrate` against production whenever `src/lib/db/schema.ts`
changes.

---

## 7. Create the first user

**There is no signup route** — that is deliberate, the app is single-tenant by
invitation. Seed one from your machine, pointed at production:

```bash
DATABASE_URL="<neon pooled url>" \
GITHUB_TOKEN="<pat>" GITHUB_OWNER="<owner>" GITHUB_REPO="kno-notes-data" \
npm run db:seed
```

That creates **`bacsi` / `123456`** (display name *Bác sĩ*) with the 14 demo
notes, their version history, comments and one seeded quiz record.

> 🔴 **Change that password before sharing the URL.** The seed credentials are
> public knowledge — they are in this file. Re-run the seed with different
> values, or update `password_hash` directly.

Re-running the seed is idempotent: it drops the user (cascading to
`note_index`, `tags` and `user_prefs`), deletes their stored notes, and rebuilds
from scratch. It will not produce 28 notes.

---

## 8. Runtime notes

- Every `src/app/api/**/route.ts` exports `runtime = 'nodejs'`. `bcryptjs` is
  CPU-bound and pathological under Edge limits, `@octokit/rest` pulls Node
  polyfills, `pg` needs TCP sockets, and `Buffer` base64 is used for every image.
- `src/middleware.ts` runs on **Edge** and imports **only `jose`**. Never import
  the database, `bcryptjs`, `@octokit/rest` or `next/headers` from it — the Edge
  build fails, and the failure message is not obvious.
- `/api/mcp` allows 60 s and `/api/notes/[id]/quiz/generate` 30 s (`vercel.json`),
  both within the Hobby 60 s ceiling.
- CORS is opened only on `/api/v1/*` and `/api/mcp`, the two machine-facing
  surfaces. The cookie-session API stays same-origin, which is what makes
  `SameSite=Lax` sufficient against CSRF.
- Rate limiting on `/api/v1` and `/api/mcp` is per-instance and **best effort** —
  see `docs/mcp.md`.
- `sin1` (Singapore) is the closest Vercel region to Vietnamese users.

---

## Local development

```bash
brew services start postgresql@16
npm install
cp .env.example .env.local
# edit .env.local: set AUTH_SECRET; leave GITHUB_* EMPTY to use ./.data
npm run db:setup     # creates kno_notes_dev + kno_notes_test, migrates both
npm run db:seed      # bacsi / 123456 with the 14 demo notes
npm run dev
```

`npm test` uses `kno_notes_test` and the filesystem storage adapter, so the whole
suite runs with no PAT, no Gemini key and no network.

To exercise `/api/v1` or `/api/mcp` locally you need an API key:

```bash
npx tsx scripts/make-key.ts bacsi "local dev"
```
