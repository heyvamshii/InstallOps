# InstallOps

A job-lifecycle tracker for field installation work — solar and battery storage.

A job moves through six stages, **Intake → Design → Permitting → Installation → QA →
Complete**, and four roles each get a different view of it: **Coordinator, Designer,
Field Tech, Admin**.

The idea behind the software is that the stage is not a label somebody types into a
spreadsheet. It is a state machine with enforced transitions, an append-only audit
trail, and per-role permissions checked on the server. You cannot skip Permitting. You
cannot close a job that failed inspection. A Field Tech cannot open another tech's job —
not because the button is hidden, but because the record is never in their queryset.

---

## The problem it solves

Installation businesses lose money in the handoffs, not in the work.

A job waits three weeks on a permit nobody chased. A crew drives out before the design
was approved and comes back empty-handed. An inspection fails and never gets re-booked.
The root cause is always the same: the real state of a job lives in one person's inbox,
and everyone else is guessing.

InstallOps makes that state explicit and enforced:

- **A job is always in exactly one stage, and only the role that owns that stage can
  advance it.** No more "I thought Design had already sent it over."
- **Illegal moves are impossible, not merely discouraged.** Nobody jumps a job straight
  to Installation because the customer is shouting.
- **A failed inspection sends the job back to Installation with a mandatory reason**, and
  counts as rework — so rework becomes a number you can filter on instead of an anecdote.
- **Every transition writes an immutable record** of who moved it, when, and why. That is
  the answer to "where did this job stall?"
- **Each role opens the app to their own work.** A field tech sees their jobs, not a
  400-row grid to filter through.
- **The overview answers the operational questions**: what is stuck, what is overdue, who
  is overloaded, and how much is being reworked.

---

## The lifecycle

```
INTAKE → DESIGN → PERMITTING → INSTALLATION → QA → COMPLETE
                                     ↑          │
                                     └──────────┘
                                   QA fail = rework
```

| Stage | Owner | Exits when |
|---|---|---|
| Intake | Coordinator | Customer, site, and scope captured |
| Design | Designer | Design package uploaded and approved |
| Permitting | Coordinator | Permit approved by the AHJ |
| Installation | Field Tech | Install checklist complete, photos uploaded |
| QA | Coordinator | Inspection passed |
| Complete | — | Terminal |

The enforced rules:

1. Forward only, one step at a time — no skipping.
2. Exactly one backward edge, `QA → INSTALLATION`, only on a failed inspection, and it
   requires a reason.
3. `COMPLETE` is terminal. Nothing moves out of it, including for an Admin.
4. Only the owning role of the current stage may advance it; an Admin may override, and
   the override is flagged in the history.
5. A job can be put on hold at any stage. Hold is a flag, not a stage — a held job
   rejects every transition until it is released.

Roles, ownership, visibility scoping, and the full permission matrix are documented in
[docs/domain-model.md](docs/domain-model.md).

---

## Tech stack

| Layer | Choice | Role in the project |
|---|---|---|
| Frontend | **Angular 22** — standalone components, signals, lazy routes | The role-aware UI; signals hold auth, job, and filter state without a store library |
| Language | **TypeScript** (strict) | The six stages and four roles are compile-time enums, so an invalid stage is a build error |
| Build | **Angular CLI** (esbuild + Vite dev server) | Dev server with HMR, production bundles, test wiring |
| UI behaviour | **Angular CDK** | Virtual scroll for the job table, plus overlay and a11y primitives — behaviour only, with custom design tokens on top |
| Backend | **Django 6.1** | ORM, migrations, auth, admin; the boundary the state machine lives inside |
| API | **Django REST Framework** | CRUD, filtering, ordering, pagination, and per-action permission classes |
| Aggregate query | **Strawberry-Django** at `/graphql/` | One query behind the overview screen, replacing ten REST calls |
| GraphQL client | **Apollo Angular** | Runs over Angular's HttpClient, so GraphQL and REST share one auth path |
| Auth | **SimpleJWT** | Short-lived access tokens with refresh rotation |
| Filters | **django-filter** | Turns the table's filter controls into safe ORM queries |
| API docs | **drf-spectacular** | OpenAPI schema and Swagger UI at `/api/docs/` |
| Database | **PostgreSQL** | Relational integrity for the job graph, with indexes behind the filtered table |
| Config | **dj-database-url**, **python-dotenv** | One `DATABASE_URL` drives local and production |
| Driver | **psycopg 3** | Postgres adapter |
| Tests | **pytest**, **pytest-django** | Covers the state machine, every cell of the permission matrix, and the GraphQL query |
| Static | **WhiteNoise** | Hashed static assets served from the backend |
| Server | **Gunicorn** | Production WSGI process |
| Frontend tests | **Vitest** | Guards, HTTP interceptor, URL-state serialisation, domain rules |
| End-to-end | **Playwright** | The lifecycle and access-control flows, driven through the real UI |
| Errors | **Sentry** | Optional on both sides; the frontend client is a lazy chunk loaded only when a DSN is set |

---

## Screens

**Job queue** — server-paginated and virtualised, with filters for stage, priority,
assigned tech, hold, overdue, and rework, plus full-text search across job number,
customer, address, and permit number. All of that state lives in the URL, so a filtered
view is shareable, survives a refresh, and steps correctly under the back button.

**Job detail** — lifecycle progress, the stage-advance controls the current user is
actually allowed to use, a per-stage checklist, notes, system specifications, and the
complete transition history including admin overrides and rework reasons. Stage changes
apply optimistically and roll back to the previous state if the server rejects them.

**Overview** — jobs by stage, counts for overdue, held, and reworked jobs, and recent
movement. Every figure links through to the queue with the matching filter applied.

This screen is the one place the app uses GraphQL. Assembled from REST it needed ten
requests — six stage counts plus overdue, held, rework, and the recent list. A single
`overview` query replaces them, and on the server the counts collapse into one conditional
aggregation, so it is two database queries rather than ten request cycles. Measured on
localhost against 210 seeded jobs, median of five runs: **96 ms across 10 requests → 12 ms
in 1**. Most of that saving is server-side work rather than round-trip latency, since
localhost has almost none.

Apollo Client costs about 40 kB gzipped, so it is provided on the dashboard route rather
than at the application root — it ships in that route's lazy chunk and never reaches
users who don't open the overview.

**People** — the user directory grouped by role (Admin only).

---

## Local setup

Requires Python 3.12+, Node 20+, and a PostgreSQL database.

**Backend** — from the repository root:

```bash
python -m venv backend/.venv
```

Activate it. On macOS or Linux:

```bash
source backend/.venv/bin/activate
```

On Windows (PowerShell):

```powershell
backend\.venv\Scripts\Activate.ps1
```

Then, with the environment active:

```bash
pip install -r backend/requirements-dev.txt
```

Copy `backend/.env.example` to `backend/.env` and set `SECRET_KEY` and `DATABASE_URL`
(generate a key with `python -c "import secrets; print(secrets.token_urlsafe(50))"`).
`DEBUG` defaults to `False`, so local development must set `DEBUG=True` — the example
file already does.

```bash
python backend/manage.py migrate
```

```bash
python backend/manage.py runserver
```

**Frontend**

```bash
npm install --prefix frontend
```

```bash
npm start --prefix frontend
```

The API runs on `http://localhost:8000` and the app on `http://localhost:4200`.
API documentation is at `/api/docs/` and the health check at `/health/`.

> With no `DATABASE_URL` set, development falls back to SQLite and prints a warning.
> That is a convenience for a first run only — migrations should be generated and
> applied against PostgreSQL.

**Demo data**

```bash
python backend/manage.py seed_demo --flush
```

Creates 210 jobs spread across all six stages, 90 customers, and 8 users with a
backfilled transition history. The dataset is deterministic, so the same seed always
produces the same jobs.

Sign in with `coordinator`, `designer`, `tech`, or `admin` — password `InstallOps!2026`.
There are additional users (`coordinator2`, `designer2`, `tech2`, `tech3`) so that
per-technician scoping is visible.

**Tests** — with the virtual environment active:

```bash
cd backend && pytest
```

```bash
npm test --prefix frontend -- --watch=false
```

End-to-end needs a seeded API running on port 8000; it starts the dev server itself:

```bash
cd frontend && npx playwright test
```

97 backend tests (88% coverage), 56 frontend unit tests, and 15 Playwright specs. GitHub
Actions runs all three on every push, plus `makemigrations --check`, `check --deploy`,
and a production build — the backend job runs against PostgreSQL rather than SQLite.

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/token/` | Sign in — returns access, refresh, and the user |
| `POST /api/auth/token/refresh/` | Rotate the access token |
| `GET /api/auth/me/` | The current user; the authority on role |
| `GET /api/auth/users/` | User directory; writable by Admin only |
| `GET /api/jobs/` | Paginated, filtered, ordered job list — scoped by role |
| `POST /api/jobs/` | Create a job in Intake with its checklist |
| `GET /api/jobs/{id}/` | Detail: history, checklist, notes, documents, available transitions |
| `POST /api/jobs/{id}/transition/` | The only way a stage moves |
| `POST /api/jobs/{id}/hold/` | Hold or release a job |
| `POST /api/jobs/{id}/notes/` | Add a note |
| `POST /api/checklist-items/{id}/toggle/` | Tick a checklist item |
| `POST /graphql/` | The `overview` aggregate query — same JWT, same role scoping |
| `GET /health/` | Database connectivity and pending migrations |

Rejections carry a stable machine-readable code — `illegal_transition`,
`not_stage_owner`, `job_on_hold`, `reason_required` — so the client branches on the code
rather than on the message text:

```json
{
  "error": {
    "code": "reason_required",
    "message": "Moving SOL-2026-0184 back to INSTALLATION requires a reason."
  }
}
```

---

## Project structure

```
InstallOps/
├── backend/
│   ├── apps/
│   │   ├── accounts/     custom User model and the Role enum
│   │   ├── jobs/         Stage enum, transition graph, services, REST API
│   │   └── dashboard/    GraphQL schema and JWT-authenticated endpoint
│   ├── config/           settings, URLs, health endpoint
│   └── requirements*.txt
├── frontend/
│   └── src/app/
│       ├── core/         auth, HTTP interceptor, guards, API clients, domain types
│       ├── features/     login, job queue, job detail, overview, people
│       ├── layout/       application shell
│       └── shared/       role-aware rendering directive
└── docs/
    └── domain-model.md   stages, roles, transition rules, permission matrix
```

The stage and role definitions exist in two places by necessity — `backend/apps/jobs/
constants.py` for enforcement and `frontend/src/app/core/domain/job.model.ts` so the UI
can render the right controls without a round trip. The server is the authority; the
client copy is a convenience and is never trusted.

---

## Deployment

The frontend is a static build (Vercel config in `frontend/vercel.json`); the backend is
a standard Django service (`backend/Procfile`, release phase runs migrate and
collectstatic); the database is PostgreSQL.

Before the first deploy:

1. Set `apiBaseUrl` in `frontend/src/environments/environment.ts` to the API's origin.
   The build ships a placeholder and the app refuses to start if it is left in place.
2. Set backend environment variables: `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_HOSTS`,
   `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` (the frontend's origin), and
   optionally `SENTRY_DSN`. Leave `DEBUG` unset — it defaults to `False`.
3. Run `python manage.py check --deploy` against the production settings; CI already
   gates on this passing with no warnings.
4. Seed demo data only if this is a demo environment: `seed_demo` refuses to run with
   `DEBUG=False` unless `--allow-production` is passed, because it creates accounts with
   a password published in this file.

## Security model

Worth stating plainly, because it is the part of this project most worth reviewing:

- **The server is the only boundary.** Route guards and role-aware rendering are UX;
  every rule they express is enforced again in the API and covered by tests that call it
  directly with a valid token for the wrong role.
- **Scoping is re-applied at every entry point** — the job viewset, the nested checklist
  endpoint, the customer directory, and the GraphQL resolver each filter independently.
- **Out-of-scope records return 404, not 403**, so a Field Tech cannot probe for the
  existence of jobs that are not theirs.
- **Signing out revokes the refresh token server-side** (SimpleJWT blacklist), rather
  than only clearing browser storage.
- **The access token is held in memory only.** The refresh token is in `localStorage`,
  which is a deliberate trade-off: an httpOnly cookie would be stronger and would require
  the backend to own the session.
- **`DEBUG` defaults to `False`**, so a deployment that forgets to set it fails closed
  rather than serving stack traces.
- **GraphiQL and schema introspection are disabled** when `DEBUG` is off.
- **Uploads are limited** by extension allowlist and size, and document kinds are
  role-restricted — a Field Tech can upload a site photo, not a design package.
- **The demo seed command refuses to run** with `DEBUG=False` unless explicitly forced,
  because it creates accounts with a password published in this README.

## Current limitations

Called out so they read as decisions rather than oversights:

- Documents store metadata and a local file field. Object storage is not wired up.
- No scheduling or dispatch calendar, and no route optimisation.
- No customer-facing portal, email, or notifications.
- Single organisation — there is no tenancy model.
- Not deployed yet. The deployment configuration exists (`vercel.json`, `Procfile`,
  environment-driven settings) and `check --deploy` passes, but there is no live URL.
- Sentry is wired on both sides and activates when a DSN is set; it has not been verified
  against a real Sentry project.
- Concurrency: `transition_job` takes a row lock, which SQLite ignores. It is only
  meaningful on PostgreSQL and there is no concurrent-transition test yet.
- Accounts are created through the Django admin. The user API can change a role but
  cannot create a user, because there is no password-setting flow.
