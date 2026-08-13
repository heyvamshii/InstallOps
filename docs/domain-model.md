# InstallOps — Domain Model (LOCKED)

> This file is the single source of truth for the job lifecycle and the permission
> matrix. The stage enum, role enum, and transition table below are mirrored 1:1 in
> `backend/apps/jobs/constants.py` and `frontend/src/app/core/domain/`.
> **Do not add a stage or a role without editing this file first.**

---

## 1. Lifecycle — 6 stages

A **Job** is one field installation, from customer signature to closed-out install.
It occupies exactly one stage at a time.

| # | Stage          | Owner role   | Entered when                                            | Operational exit criterion              |
|---|----------------|--------------|---------------------------------------------------------|-----------------------------------------|
| 1 | `INTAKE`       | Coordinator  | Job created from a signed contract                       | Site address, customer, and scope captured |
| 2 | `DESIGN`       | Designer     | Intake complete                                          | Design package uploaded and approved    |
| 3 | `PERMITTING`   | Coordinator  | Design approved                                          | Permit marked approved by the AHJ       |
| 4 | `INSTALLATION` | Field Tech   | Permit approved and crew scheduled                       | Install checklist complete + photos     |
| 5 | `QA`           | Coordinator  | Install complete                                         | Inspection **passed**                   |
| 6 | `COMPLETE`     | Coordinator  | Inspection passed                                        | Terminal                                |

> **The exit criteria are guidance for the humans, not gates in the code.** The stage
> owner decides when their stage is finished; the software does not refuse to advance a
> job whose checklist is incomplete. That is deliberate — reality diverges from a
> checklist often enough (a permit arrives by phone, a photo is on someone's camera)
> that hard-gating would push people to work around the system, which is exactly how a
> tracker stops reflecting the truth. The checklist is a visible completeness signal
> instead: the detail screen shows `3/8` and the job carries that record.
>
> Everything in §1.1 below *is* enforced in code and covered by tests. The distinction
> matters: this table is process documentation, that list is the specification.

### Transition graph

```
INTAKE → DESIGN → PERMITTING → INSTALLATION → QA → COMPLETE
                                     ↑          │
                                     └──────────┘
                                   QA fail = rework
```

### 1.1 Enforced rules — the tested invariants

1. **Forward-only, one step at a time.** `INTAKE → PERMITTING` is invalid. No skipping.
2. **One backward edge exists:** `QA → INSTALLATION`, and only on a *failed*
   inspection. It must carry a non-empty `reason`. This increments `rework_count`.
3. **`COMPLETE` is terminal.** Nothing transitions out of it — not even Admin.
4. **Only the owning role of the *current* stage may advance it** (Admin excepted).
   A Designer cannot move a job out of `PERMITTING`.
5. **Admin may force any legal-graph transition** regardless of stage ownership, but
   still cannot skip stages or exit `COMPLETE`. Forced moves are flagged in history.
6. **A job can be put `on_hold` at any stage.** Hold is a *boolean flag, not a stage* —
   this keeps the enum at 6. A held job rejects all transitions until released.
7. **Every transition writes an immutable `StageTransition` row** (from, to, actor,
   timestamp, reason). Stage history is append-only; it is never edited or deleted.

---

## 2. Roles — 4

Roles are mutually exclusive. One user has exactly one role.

| Role          | Owns stage(s)              | Can do                                                                 |
|---------------|----------------------------|------------------------------------------------------------------------|
| `COORDINATOR` | Intake, Permitting, QA, Complete | Create jobs, edit customer/site data, submit permits, record inspection results, close jobs |
| `DESIGNER`    | Design                     | Upload/revise design packages, mark design approved. Read-only elsewhere |
| `FIELD_TECH`  | Installation               | See **only jobs assigned to them**, complete install checklists, upload photos, log hours |
| `ADMIN`       | — (override on all)        | Everything above, plus user management, force-transitions, and the org-wide dashboard |

### Visibility scope — this is a security rule, not a UI preference

| Role          | Job queryset                                    |
|---------------|--------------------------------------------------|
| `COORDINATOR` | All jobs                                        |
| `DESIGNER`    | All jobs (needs upstream/downstream context)     |
| `FIELD_TECH`  | **Only jobs where `assigned_tech == request.user`** |
| `ADMIN`       | All jobs                                        |

The same rule is applied independently at every entry point that can read job data — the
REST viewsets, the nested checklist endpoint, the customer directory, and the GraphQL
resolver. Each re-applies the filter rather than trusting a caller, because a second way
into the data is a second way to leak it.

Scoping is enforced in `get_queryset()` on the server. The Angular route guards and
`*appIfRole` directive are **UX only** — they hide controls the user would be
rejected for anyway. Every permission is tested from the API side, unauthenticated
and cross-role, so a hidden button is never the only thing standing between a Field
Tech and someone else's job.

---

## 3. Permission matrix (the thing tests assert against)

| Action                        | Coordinator | Designer | Field Tech | Admin |
|-------------------------------|:-----------:|:--------:|:----------:|:-----:|
| Create job                    | ✅          | ❌       | ❌         | ✅    |
| Edit customer / site          | ✅          | ❌       | ❌         | ✅    |
| Advance `INTAKE → DESIGN`     | ✅          | ❌       | ❌         | ✅    |
| Advance `DESIGN → PERMITTING` | ❌          | ✅       | ❌         | ✅    |
| Advance `PERMITTING → INSTALLATION` | ✅    | ❌       | ❌         | ✅    |
| Advance `INSTALLATION → QA`   | ❌          | ❌       | ✅ (own)   | ✅    |
| Advance `QA → COMPLETE`       | ✅          | ❌       | ❌         | ✅    |
| Fail QA (`QA → INSTALLATION`) | ✅          | ❌       | ❌         | ✅    |
| Toggle hold                   | ✅          | ❌       | ❌         | ✅    |
| Upload design package         | ❌          | ✅       | ❌         | ✅    |
| Complete install checklist    | ❌          | ❌       | ✅ (own)   | ✅    |
| Manage users                  | ❌          | ❌       | ❌         | ✅    |
| View org dashboard            | ✅          | ❌       | ❌         | ✅    |
| Tick a checklist item         | own stages  | own stages | own stages (own jobs) | ✅ |
| Add a note                    | ✅          | ✅       | ✅ (own)   | ✅    |
| Upload a site photo           | ✅          | ✅       | ✅ (own)   | ✅    |
| Upload a permit / inspection  | ✅          | ❌       | ❌         | ✅    |
| Read the customer directory   | ✅          | ✅       | own jobs only | ✅ |

"own stages" means the stages that role owns in the table above: a Designer may tick
Design items, a Coordinator may tick Intake, Permitting, QA, and Complete items, and a
Field Tech may tick Installation items on jobs assigned to them. Checklist rows for all
six stages exist from the moment a job is created, so scoping by job alone would let any
role tick anyone's work.

---

## 4. Core entities

```
User (role, is_active)
  └── assigned_jobs ──┐
                      │
Customer 1───n Job ───┼── n StageTransition   (append-only audit trail)
                      ├── n Document          (design package, permit PDF, photo)
                      ├── n ChecklistItem     (per-stage, template-driven)
                      └── n Note              (free-text, timestamped)
```

**Job** carries: `job_number` (unique, human-readable), `stage`, `on_hold`,
`customer`, `site_address`, `assigned_tech`, `assigned_designer`, `priority`,
`target_completion_date`, `rework_count`, `created_at`, `updated_at`.

Indexes that matter: `(stage, target_completion_date)` for the queue views,
`(assigned_tech, stage)` for the Field Tech scope, and a trigram or `ILIKE`-backed
index on `job_number` + customer name for search.

---

## 5. Deliberately out of scope

Cut so the project ships. Listed here so the omissions read as decisions, not gaps:

- Real file storage (S3) — documents store metadata + a local/dev file field
- Scheduling/dispatch calendar, route optimization
- Customer-facing portal, notifications, email
- Multi-tenancy / multiple orgs
- Offline-first field app
