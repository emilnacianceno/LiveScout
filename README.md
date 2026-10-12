# LiveScout

Collects livestream and video links from the Facebook groups you list, stores them in Postgres, and shows them in a small web UI.

> **Read this first.** The scraper drives a real browser logged in to your own Facebook account. Meta's Terms of Service restrict automated data collection from their products without permission, and an account used this way can be restricted or banned. Nothing in this repo makes that compliant. Use it only where you have the right to, and treat it as a personal tool, not something to deploy or share. See [Known limitations](#known-limitations).

## How it fits together

```
React UI (5173) ──/api──▶ Bun + Hono backend (3001) ──▶ Postgres
                                   │
                                   └──HTTP──▶ Python service (8001) ──spawns──▶ fb_live_scraper.py (Playwright)
```

| Folder | What it is |
| --- | --- |
| `frontend/` | Vite + React UI: add groups, start scrapes, browse results |
| `backend/` | Hono API. Owns groups, livestreams and scrape runs; calls the Python service |
| `python/` | `fb_live_scraper.py` (the scraper) and `server.py` (tiny HTTP wrapper that runs one job at a time) |
| `database/` | `schema.sql` (idempotent) and `updates/NNN-name.sql` (run once each) |
| `scripts/` | `setup.ts`, `db-migrate.ts`, `py.ts` (runs Python with the project venv) |
| `data/` | Runtime output, e.g. `livestreams.json` (gitignored) |

A scrape works like this: the backend asks the Python service to scrape a group. The service runs the scraper headless with a persistent browser profile (`python/profile/`), scrolls the group feed, and extracts video links. The backend upserts the results (new rows are counted, known ones get a fresh `last_seen_at`), records a `scrape_run`, and rewrites `data/livestreams.json`.

## Requirements

- [Bun](https://bun.sh) 1.x
- Python 3.10+
- PostgreSQL 14+ you can connect to

## Setup

```bash
bun run setup        # installs JS deps, creates python/.venv, installs Playwright + Chromium, creates .env
# edit .env: set the password in DATABASE_URL
bun run db:migrate   # creates the database if missing, applies schema + updates
bun run login        # opens a browser once so you can sign in to Facebook; the session is saved in python/profile/
bun run dev          # python service + backend + frontend, then open http://localhost:5173
```

`python/profile/` holds your logged-in Facebook session. It is gitignored. Treat it like a password and never share or commit it.

## Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none (required) | Postgres connection string |
| `BACKEND_PORT` | `3001` | API port |
| `PYTHON_PORT` | `8001` | Python service port (bound to 127.0.0.1) |
| `DATABASE_POOL_MAX` | `10` | Max pooled connections |

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Run all three processes with prefixed logs |
| `bun run scrape <group-url> [--scrolls N] [--live-only]` | Run the scraper directly and write JSON, no backend needed |
| `bun run typecheck` | Typecheck the backend and typecheck + build the frontend |
| `bun run test` | Backend tests (no database needed) and Python tests |
| `bun run test:db` | Backend tests including the database tests (see below) |
| `bun run db:migrate` | Apply schema and updates |

## API

All routes are under `/api`. There is **no authentication** (see below), so keep the backend on localhost.

| Method and path | Purpose |
| --- | --- |
| `GET /health`, `GET /health/database` | Liveness and DB check |
| `GET /groups`, `POST /groups` | List or add a group (`name`, `url`, `scrolls` 1 to 500, `liveOnly`) |
| `PATCH /groups/:id`, `DELETE /groups/:id` | Update or remove a group (removing cascades to its livestreams and runs) |
| `GET /livestreams?groupId=&liveOnly=` | Newest first, capped at 500 |
| `POST /scrape` | Start a background run, body `{ "groupIds"?: [uuid] }` (all active groups if omitted) |
| `GET /scrape/status`, `GET /scrape/runs` | Live progress and recent run history |

Only one scrape runs at a time, because there is a single browser profile.

## Tests and CI

```bash
bun run test        # backend route tests + Python tests (needs `bun run setup` once for pytest)
```

`bun run test:db` also runs the repository and API tests against a real database. Point `DATABASE_URL` at a **disposable** database, migrated with `bun run db:migrate`. The tests truncate `facebook_group` and everything that cascades from it, so never point them at data you care about.

```bash
DATABASE_URL=postgres://postgres:password@localhost:5432/face_test bun run db:migrate
DATABASE_URL=postgres://postgres:password@localhost:5432/face_test bun run test:db
```

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`: typecheck and frontend build, schema migration and all backend tests against a Postgres service, and the Python tests. CI never launches a browser or touches Facebook.

## Known limitations

- **Terms of Service.** See the note at the top. Automated collection from Facebook is the central risk of this project.
- **No authentication or CORS restrictions** on the API. Anyone who can reach port 3001 can start scrapes that use your logged-in session.
- **Facebook changes its markup often.** `EXTRACT_JS` in `fb_live_scraper.py` relies on `[role="article"]` and link patterns, so it can silently return nothing. There is no login-wall, checkpoint or captcha handling.
- **`is_live` is sticky.** Once a video has been seen as live it is never set back to false.
- **No scheduler or alerts.** Scrapes run only when you start them.
- **No timeout** on a scrape job; a hung browser blocks the queue until the Python service is restarted.
- `PATCH` or `DELETE /groups/<id>` with an id that is not a UUID returns 500 instead of 400.
