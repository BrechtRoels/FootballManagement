# Deploying KSV Jabbeke (Vercel + Supabase)

Everything runs on **Vercel + Supabase** (no Render). Two Vercel projects from this one repo —
Vercel natively builds each:

| Piece | Vercel project | Root Directory |
| --- | --- | --- |
| Frontend (React) | project #1 | `frontend/` (Vite) |
| Backend API (FastAPI) | project #2 | `backend/` (auto-detected FastAPI) |
| Database (Postgres) | — Supabase | free shared pooler (IPv4) |

Both redeploy on every `git push`.

---

## 0. Code is on GitHub ✅

Repo: `github.com/BrechtRoels/FootballManagement` (already pushed). `.env`/secrets are git-ignored.

---

## 1. Database — Supabase ✅ already seeded

Schema (14 tables) + admin already created (we ran `python -m app.seed`). You need the **pooler**
string for the backend. Supabase → **Connect** → **Connection pooling**, *Transaction* mode (port
**6543**) — **free & IPv4** (not the IPv6-only "Direct connection"). Shape it:

```
postgresql+psycopg://postgres.<ref>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```

---

## 2. Backend — Vercel project #2

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. **Root Directory → `backend`.** Vercel auto-detects **FastAPI** (it finds `app/main.py` with the
   `app` instance) and installs `requirements.txt`. No extra config files needed.
3. Environment variables:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase pooler string from step 1 |
   | `SECRET_KEY` | `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
   | `CORS_ORIGINS` | your frontend URL (fill in after step 3) |

   (`FIRST_ADMIN_*` not needed — the admin exists. `VERCEL=1` is auto-set, so the app uses a
   serverless-friendly DB pool and skips startup table-creation.)
4. Deploy → URL like **`https://ksvjabbeke-api.vercel.app`**. Check `…/health` and `…/docs`.

---

## 3. Frontend — Vercel project #3

1. **Add New → Project** → import the **same repo** again.
2. **Root Directory → `frontend`.** Vite is auto-detected; [`frontend/vercel.json`](frontend/vercel.json)
   handles SPA routing.
3. Environment variable:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://ksvjabbeke-api.vercel.app/api`  ← backend URL **+ `/api`** |

4. Deploy → URL like **`https://ksvjabbeke.vercel.app`**.

---

## 4. Connect them (CORS)

In the **backend** project → Settings → Environment Variables, set `CORS_ORIGINS` to the frontend URL
exactly (no trailing slash), then redeploy the backend:

```
CORS_ORIGINS=https://ksvjabbeke.vercel.app
```

---

## 5. Verify

- Open the frontend URL, sign in as `admin@ksvjabbeke.be`.
- Login network/CORS error? Confirm `VITE_API_URL` (frontend) = backend URL **+ `/api`**, and
  `CORS_ORIGINS` (backend) exactly matches the frontend origin.
- Calendar subscriptions & map previews work (the feed is served from the backend's own HTTPS URL).

## Notes
- **Serverless cold starts:** first request after idle spins the function up (a second or two).
- **Vercel Hobby** is non-commercial with a 10s function timeout — fine for this app.
- **Schema changes later:** seed/startup creates *tables*; altering existing ones needs Alembic
  (dependency already included).

## Updating
`git push` → both Vercel projects rebuild and redeploy automatically.
