# Deploying KSV Jabbeke (Vercel + Supabase)

**One** Vercel project serves everything from a single domain, plus Supabase for the database:

| Piece | Host |
| --- | --- |
| Frontend (React) | **Vercel** (static build) |
| Backend API (FastAPI) | **Vercel** (Python serverless function under `/api`) |
| Database (Postgres) | **Supabase** (free shared pooler, IPv4) |

The root [`vercel.json`](vercel.json) builds the React app, runs FastAPI as a serverless function, and
routes `/api/*` to it — so the site and API share one origin (**no CORS**, and `VITE_API_URL` stays `/api`).
Redeploys on every `git push`. No Render, no separate server.

---

## 0. Put the code on GitHub

The repo is initialised locally. Create an **empty** GitHub repo, then:

```bash
cd /Users/brechtroelswork/Documents/FootballManagement
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

`.env` files and secrets are git-ignored.

---

## 1. Database — Supabase  ✅ already seeded

The schema (14 tables) and the admin account already exist in your Supabase project — we ran
`python -m app.seed` against it. You just need the **pooler** connection string.

Supabase → **Connect** → **Connection pooling**, *Transaction* mode (port **6543**) — **free and IPv4**
(do *not* use the "Direct connection": IPv6-only / paid IPv4 add-on). Shape it for psycopg:

```
postgresql+psycopg://postgres.<ref>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```

That's your `DATABASE_URL` (holds the password — keep it secret).

> Re-seed a fresh DB later with:
> `cd backend && DATABASE_URL='…6543…' FIRST_ADMIN_PASSWORD='…' .venv/bin/python -m app.seed`

---

## 2. Deploy — one Vercel project

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. Leave **Root Directory = repo root** (the default). Vercel reads the root `vercel.json` — it builds
   the frontend (`frontend/dist`) and the Python function (`api/index.py`, which loads FastAPI from
   `backend/`). Don't override the build settings.
3. Add **Environment Variables**:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase pooler string from step 1 |
   | `SECRET_KEY` | a long random string — `python -c "import secrets;print(secrets.token_urlsafe(48))"` |

   That's it — **no `CORS_ORIGINS`, no `VITE_API_URL`** (same origin; the frontend calls `/api` directly).
   `FIRST_ADMIN_*` aren't needed (the admin already exists). `VERCEL=1` is set automatically, so the app
   uses a serverless-friendly DB setup and skips startup table-creation.
4. Deploy. You get one URL, e.g. **`https://ksvjabbeke.vercel.app`** — site at `/`, API at `/api/*`.

---

## 3. Verify

- Open the URL and sign in as `admin@ksvjabbeke.be`.
- If login fails: check that `DATABASE_URL` is the **pooler** string (port 6543, `?sslmode=require`) and
  `SECRET_KEY` is set. Function logs are under the Vercel project → **Logs**.
- Calendar subscriptions & map previews work automatically (Vercel serves HTTPS).

## Notes
- **Serverless cold starts:** the first request after idle spins the function up (a second or two), then fast.
- **Vercel Hobby plan** is non-commercial and has a 10s function timeout — fine for this app.
- `/api/docs` isn't exposed in production (only `/api/*` app routes are routed to the backend); run the
  backend locally for the interactive API docs.
- **Schema changes later:** the seed creates *tables*; altering existing tables needs Alembic
  (dependency already included).

## Updating
`git push` → Vercel rebuilds and redeploys automatically.
