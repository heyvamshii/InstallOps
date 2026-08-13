"""Domain services — the only sanctioned way to change a job's stage or hold status.

Views call these; they never assign ``job.stage`` themselves. Keeping the rules here
means they can be tested without HTTP, and there is exactly one code path that can move
a job, which is what makes the audit trail trustworthy.
"""

from django.db import IntegrityError, transaction

from apps.accounts.constants import Role
from apps.accounts.models import User

from .checklists import template_for
from .constants import (
    REWORK_TRANSITIONS,
    STAGE_ORDER,
    STAGE_OWNER,
    Stage,
    is_legal_transition,
    requires_reason,
)
from .exceptions import (
    IllegalTransition,
    JobOnHold,
    NotStageOwner,
    ReasonRequired,
)
from .models import ChecklistItem, Job, Note, StageTransition

MAX_JOB_NUMBER_ATTEMPTS = 3


def create_job(*, actor: User, **fields) -> Job:
    """Create a job in INTAKE and lay down its full checklist.

    Retries on the job-number race: the number is derived from the current maximum, and
    the unique constraint is what actually prevents duplicates.
    """
    last_error: IntegrityError | None = None

    for _ in range(MAX_JOB_NUMBER_ATTEMPTS):
        try:
            with transaction.atomic():
                job = Job.objects.create(created_by=actor, stage=Stage.INTAKE, **fields)
                seed_checklist(job)
                return job
        except IntegrityError as exc:  # pragma: no cover - concurrency path
            last_error = exc

    raise last_error  # type: ignore[misc]


def seed_checklist(job: Job) -> None:
    """Materialise every stage's checklist up front so progress is visible ahead of time."""
    ChecklistItem.objects.bulk_create(
        [
            ChecklistItem(job=job, stage=stage, label=label, order=order)
            for stage in STAGE_ORDER
            for order, label in enumerate(template_for(stage))
        ],
        ignore_conflicts=True,
    )


@transaction.atomic
def transition_job(
    *, job: Job, to_stage: str, actor: User, reason: str = ""
) -> StageTransition:
    """Move a job one legal step and record it. Raises a typed ``DomainError`` otherwise.

    Order of checks is deliberate: hold before legality before ownership before reason,
    so the error the caller sees is the first real blocker rather than an incidental one.
    """
    job = Job.objects.select_for_update().get(pk=job.pk)

    if job.on_hold:
        raise JobOnHold(
            f"{job.job_number} is on hold"
            + (f": {job.hold_reason}" if job.hold_reason else "")
        )

    if not is_legal_transition(job.stage, to_stage):
        raise IllegalTransition(
            f"Cannot move {job.job_number} from {job.stage} to {to_stage}."
        )

    was_forced = False
    if STAGE_OWNER[job.stage] != actor.role:
        if not actor.is_privileged:
            raise NotStageOwner(
                f"{job.stage} is owned by {STAGE_OWNER[job.stage]}, not {actor.role}."
            )
        was_forced = True

    reason = (reason or "").strip()
    if requires_reason(job.stage, to_stage) and not reason:
        raise ReasonRequired(
            f"Moving {job.job_number} back to {to_stage} requires a reason."
        )

    from_stage = job.stage
    job.stage = to_stage

    updated_fields = ["stage", "updated_at"]
    if (from_stage, to_stage) in REWORK_TRANSITIONS:
        job.rework_count += 1
        updated_fields.append("rework_count")

    job.save(update_fields=updated_fields)

    return StageTransition.objects.create(
        job=job,
        from_stage=from_stage,
        to_stage=to_stage,
        actor=actor,
        reason=reason,
        was_forced=was_forced,
    )


@transaction.atomic
def set_hold(*, job: Job, actor: User, on_hold: bool, reason: str = "") -> Job:
    """Put a job on hold or release it. Holds block every transition until released."""
    if actor.role != Role.COORDINATOR and not actor.is_privileged:
        raise NotStageOwner("Only a Coordinator or Admin can hold or release a job.")

    reason = (reason or "").strip()
    if on_hold and not reason:
        raise ReasonRequired("Putting a job on hold requires a reason.")

    job.on_hold = on_hold
    job.hold_reason = reason if on_hold else ""
    job.save(update_fields=["on_hold", "hold_reason", "updated_at"])
    return job


def add_note(*, job: Job, actor: User, body: str) -> Note:
    return Note.objects.create(job=job, author=actor, body=body.strip())


def available_transitions(*, job: Job, actor: User) -> list[str]:
    """Transitions this user may perform right now — drives which buttons render."""
    from .constants import ALLOWED_TRANSITIONS

    if job.on_hold:
        return []
    if STAGE_OWNER[job.stage] != actor.role and not actor.is_privileged:
        return []
    return sorted(ALLOWED_TRANSITIONS[job.stage])
