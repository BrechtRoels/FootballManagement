# Deploying KSV Jabbeke (Vercel + Supabase + Render)

Three free services:

| Piece | Host | What it is |
| --- | --- | --- |
| Frontend (React) | **Vercel** | the website users open |
| Database (Postgres) | **Supabase** | stores everything |
| Backend API (FastAPI) | **Render** | the server the frontend talks to |

All three deploy from a GitHub repo and redeploy automatically on every `git push`.

---

## 0. Put the code on GitHub

The repo has been initialised locally. Create an **empty** repo on GitHub (no README),
then:

```bash
cd /Users/brechtroelswork/Documents/FootballManagement
git remote add origin https://github.com/<you>/ksvjabbeke.git
git branch -M main
git push -u origin main
```

`.env` files and secrets are git-ignored, so nothing sensitive is pushed.

---

## 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com) (pick the EU region, e.g. *Frankfurt*).
   Set a database password and save it.
2. Project → **Connect** (or Settings → Database) → **Connection pooling**, *Transaction* mode,
   port **6543**. Copy the URI. Convert it to the psycopg form by adding the driver and SSL:

   ```
   postgresql+psycopg://postgres.<ref>:<DB-PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```

   Keep this string — it's your `DATABASE_URL`. It contains the password, so treat it as a secret.

---

## 2. Create the tables + first admin (run once)

From your machine, point the existing seed script at Supabase. This creates every table and the
admin account (no demo data):

```bash
cd backend
DATABASE_URL='postgresql+psycopg://postgres.<ref>:<DB-PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require' \
FIRST_ADMIN_EMAIL='admin@ksvjabbeke.be' \
FIRST_ADMIN_PASSWORD='<choose-a-strong-password>' \
.venv/bin/python -m app.seed
```

Add `--demo` at the end only if you want the sample teams/players/activities in production too.
(The backend also auto-creates missing tables on startup, so this step is mainly to create the admin.)

---

## 3. Backend API — Render

1. At [render.com](https://render.com): **New +** → **Blueprint** → connect your GitHub repo.
   Render reads [`render.yaml`](render.yaml) and proposes the `ksvjabbeke-api` web service (free plan).
2. Before/after the first deploy, set these env vars (the blueprint marks them as "manual"):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase string from step 1 |
   | `FIRST_ADMIN_PASSWORD` | the admin password you used in step 2 |
   | `CORS_ORIGINS` | your Vercel URL (fill in after step 4), e.g. `https://ksvjabbeke.vercel.app` |

   `SECRET_KEY` is generated automatically; `FIRST_ADMIN_EMAIL/NAME` and the token lifetime come from the blueprint.
3. Deploy. When it's live, note the URL, e.g. **`https://ksvjabbeke-api.onrender.com`**.
   Check `https://ksvjabbeke-api.onrender.com/health` → `{"status":"ok"}`.

> Free tier sleeps after ~15 min idle; the first request then takes ~30s to wake. Upgrade the
> service to remove this later if needed.

---

## 4. Frontend — Vercel

1. At [vercel.com](https://vercel.com): **Add New → Project** → import the GitHub repo.
2. Set **Root Directory** to `frontend`. Vercel auto-detects Vite (build `npm run build`, output `dist`);
   [`frontend/vercel.json`](frontend/vercel.json) handles SPA routing.
3. Add an environment variable:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://ksvjabbeke-api.onrender.com/api`  ← your Render URL + `/api` |

4. Deploy. You'll get a URL like **`https://ksvjabbeke.vercel.app`**.

---

## 5. Connect them (CORS)

Back in **Render → ksvjabbeke-api → Environment**, set `CORS_ORIGINS` to your Vercel URL
(comma-separate several if you add a custom domain later):

```
CORS_ORIGINS=https://ksvjabbeke.vercel.app
```

Save → Render redeploys. Done.

---

## 6. Verify

- Open the Vercel URL, sign in as `admin@ksvjabbeke.be` with the password from step 2.
- If login fails with a network/CORS error: confirm `VITE_API_URL` (Vercel) points at the Render
  URL **with `/api`**, and `CORS_ORIGINS` (Render) exactly matches the Vercel origin (no trailing slash).
- **Calendar subscriptions & map previews** work automatically — the feed URL is derived from
  `VITE_API_URL`, and calendar apps need the API reachable over HTTPS (Render provides this).

## Updating later

`git push` to `main` → Render and Vercel both rebuild and redeploy automatically. For database
*schema* changes over time, switch from the current "create tables on startup" approach to Alembic
migrations (the dependency is already in `requirements.txt`).
