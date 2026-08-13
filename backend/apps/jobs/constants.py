"""Stage enum and transition graph — LOCKED at 6 stages.

This module is the executable copy of ``docs/domain-model.md`` section 1. The Angular
copy lives in ``frontend/src/app/core/domain/job.model.ts`` and must stay in sync.
"""

from django.db import models

from apps.accounts.constants import Role


class Stage(models.TextChoices):
    INTAKE = "INTAKE", "Intake"
    DESIGN = "DESIGN", "Design"
    PERMITTING = "PERMITTING", "Permitting"
    INSTALLATION = "INSTALLATION", "Installation"
    QA = "QA", "QA"
    COMPLETE = "COMPLETE", "Complete"


#: Display/progress order. Index is also the progress step shown in the UI.
STAGE_ORDER: tuple[str, ...] = (
    Stage.INTAKE,
    Stage.DESIGN,
    Stage.PERMITTING,
    Stage.INSTALLATION,
    Stage.QA,
    Stage.COMPLETE,
)

#: The only legal edges. Forward one step, plus the single QA rework edge.
#: COMPLETE is terminal and intentionally absent as a source.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    Stage.INTAKE: frozenset({Stage.DESIGN}),
    Stage.DESIGN: frozenset({Stage.PERMITTING}),
    Stage.PERMITTING: frozenset({Stage.INSTALLATION}),
    Stage.INSTALLATION: frozenset({Stage.QA}),
    Stage.QA: frozenset({Stage.COMPLETE, Stage.INSTALLATION}),
    Stage.COMPLETE: frozenset(),
}

#: Which role owns the work *while a job sits in* each stage.
STAGE_OWNER: dict[str, str] = {
    Stage.INTAKE: Role.COORDINATOR,
    Stage.DESIGN: Role.DESIGNER,
    Stage.PERMITTING: Role.COORDINATOR,
    Stage.INSTALLATION: Role.FIELD_TECH,
    Stage.QA: Role.COORDINATOR,
    Stage.COMPLETE: Role.COORDINATOR,
}

#: Backward edges require an explicit, non-empty reason recorded in the audit trail.
REWORK_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {(Stage.QA, Stage.INSTALLATION)}
)

TERMINAL_STAGES: frozenset[str] = frozenset({Stage.COMPLETE})


class Priority(models.TextChoices):
    LOW = "LOW", "Low"
    NORMAL = "NORMAL", "Normal"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


def is_legal_transition(from_stage: str, to_stage: str) -> bool:
    return to_stage in ALLOWED_TRANSITIONS.get(from_stage, frozenset())


def requires_reason(from_stage: str, to_stage: str) -> bool:
    return (from_stage, to_stage) in REWORK_TRANSITIONS
