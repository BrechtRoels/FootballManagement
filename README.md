# KSV Jabbeke — Clubplatform

A professional football-club management platform, set up for **KSV Jabbeke**, with three roles:

| Role | Can do |
| --- | --- |
| **Admin** | Create teams, create trainer/player accounts, assign them to teams, manage facilities (pitches & rooms) |
| **Trainer** | Schedule trainings, matches, meetings & events; reserve facilities (with conflict checking); pick the squad |
| **Player** | See the agenda, mark availability (yes / maybe / no), see whether they're selected, chat, get notified |

**Features:** activity planning with pitch/room availability checks · squad selection · per-player availability · **team chat + one-to-one direct messages** (a coach can message the whole team via the team channel, or an individual player privately; direct messages are limited to coach↔player — players cannot DM each other) · in-app notifications (incl. when an activity is cancelled) · role-based access control.

---

## Tech stack

- **Backend:** FastAPI · SQLAlchemy 2 (async) · PostgreSQL · JWT auth · psycopg 3
- **Frontend:** React + Vite + TypeScript · Tailwind CSS · TanStack Query · React Router
- **Database:** local Postgres via Docker for development → **Supabase** (managed Postgres) in production
- **Deployment target:** Vercel (frontend) + Supabase (database) — see [Production](#production-deployment)

```
FootballManagement/
├── backend/     FastAPI app, models, routes, seed script
└── frontend/    React single-page app
```

---

## Quick start (local development)

You need **Docker** (for Postgres), **Python 3.11+**, and **Node 18+**.

### 1. Database

```bash
cd backend
cp .env.example .env          # adjust if you like
docker compose up -d          # starts Postgres on localhost:5432
```

### 2. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python -m app.seed --demo     # creates tables, the first admin, and demo data
uvicorn app.main:app --reload --port 8000
```

API now runs at **http://localhost:8000** · interactive docs at **http://localhost:8000/docs**.

> **Port 8000 already in use?** (Docker Desktop sometimes claims it.) Run the API on
> another port and tell the frontend proxy where it is:
> ```bash
> uvicorn app.main:app --reload --port 8080
> # then in step 3:  VITE_API_TARGET=http://localhost:8080 npm run dev
> ```

### 3. Frontend (React)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Open **http://localhost:5173** and sign in.

### Demo logins (after `python -m app.seed --demo`)

| Role | Email | Password |
| --- | --- | --- |
| Admin (secretariaat) | `admin@ksvjabbeke.be` | `ChangeMe123!` |
| Trainer (Eerste Ploeg) | `koen@ksvjabbeke.be` | `ChangeMe123!` |
| Player (Eerste Ploeg) | `wout@ksvjabbeke.be` | `ChangeMe123!` |

The demo seeds KSV Jabbeke with four teams (Eerste Ploeg, Beloften, U17, Dames),
a full first-team squad, facilities at Sportpark Jabbeke (Hoofdterrein, Terrein B,
Kleedkamers, Kantine) and upcoming activities incl. a home match vs **SK Varsenare**.

The admin email/password come from `backend/.env` (`FIRST_ADMIN_*`). Run
`python -m app.seed` (without `--demo`) to create just the admin on a clean database.

---

## How the roles work

- **Accounts are created by the admin**, never self-registered. Admin → **People** → *New account*
  generates a one-time temporary password to share with the member.
- The admin assigns people to a team (Admin → **Teams** → open a team → *Add member*). You can add an
  existing person or **create a brand-new account and assign it in one step**.
- A user's **team role** (trainer/player) is per-team, so the same person can coach one team and play in another.
- Trainers can only schedule/manage the teams they coach; players only see their own teams. Enforced
  server-side in [`backend/app/services/access.py`](backend/app/services/access.py).

## Resource conflict checking

When scheduling an activity you can reserve facilities (pitches, dressing rooms, rooms). The API checks
for overlapping bookings of the same facility and warns before you double-book — see
[`backend/app/services/scheduling.py`](backend/app/services/scheduling.py). You can still override
("Schedule anyway").

---

## Production deployment

**Full step-by-step: [DEPLOY.md](DEPLOY.md).** Everything runs on **Vercel + Supabase** (no separate
server) — two Vercel projects from this one repo, redeploying on every `git push`:

1. **Database — Supabase:** copy the *Connection pooling* string (Transaction mode, port 6543, free &
   IPv4) into `DATABASE_URL` (`postgresql+psycopg://…?sslmode=require`). Run `python -m app.seed` once
   against it to create the schema + admin.
2. **Backend — Vercel** (Root Directory `backend/`): Vercel auto-detects FastAPI at `backend/app/main.py`.
   Set `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`.
3. **Frontend — Vercel** (Root Directory `frontend/`, [`frontend/vercel.json`](frontend/vercel.json)):
   set `VITE_API_URL=https://<your-backend>.vercel.app/api`.

### Before going live
- Set a strong `SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`).
- The app currently auto-creates tables on startup. For schema changes over time, switch to
  **Alembic** migrations (the dependency is already included).

---

## API overview

`POST /api/auth/login` · `GET /api/auth/me` · `/api/users` (admin) · `/api/teams` + `/members` ·
`/api/resources` · `/api/activities` (+ `/check-conflicts`, `/cancel`, `/availability`, `/selection`) ·
`/api/teams/{id}/messages` (team chat) · `/api/dm/contacts` + `/api/dm/conversation/{user_id}` (direct
messages) · `/api/notifications`. Full interactive docs at `/docs`.
