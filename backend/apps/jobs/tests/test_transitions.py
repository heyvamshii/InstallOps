"""State machine rules, tested without HTTP.

These assert the invariants written in docs/domain-model.md section 1. If one of these
fails, the audit trail can no longer be trusted, so treat a failure here as a stop.
"""

import pytest

from apps.jobs.constants import STAGE_ORDER, Stage
from apps.jobs.exceptions import (
    IllegalTransition,
    JobOnHold,
    NotStageOwner,
    ReasonRequired,
)
from apps.jobs.models import StageTransition
from apps.jobs.services import available_transitions, set_hold, transition_job

pytestmark = [pytest.mark.django_db, pytest.mark.unit]


# --------------------------------------------------------------- the happy path

def test_full_lifecycle_advances_one_stage_at_a_time(
    make_job, coordinator, designer, field_tech
):
    job = make_job(Stage.INTAKE)
    actors = {
        Stage.INTAKE: coordinator,
        Stage.DESIGN: designer,
        Stage.PERMITTING: coordinator,
        Stage.INSTALLATION: field_tech,
        Stage.QA: coordinator,
    }

    for index, from_stage in enumerate(STAGE_ORDER[:-1]):
        to_stage = STAGE_ORDER[index + 1]
        transition_job(job=job, to_stage=to_stage, actor=actors[from_stage])
        job.refresh_from_db()
        assert job.stage == to_stage

    assert job.stage == Stage.COMPLETE
    assert job.transitions.count() == 5
    assert job.rework_count == 0


def test_transition_writes_an_audit_row(make_job, coordinator):
    job = make_job(Stage.INTAKE)

    transition = transition_job(job=job, to_stage=Stage.DESIGN, actor=coordinator)

    assert transition.from_stage == Stage.INTAKE
    assert transition.to_stage == Stage.DESIGN
    assert transition.actor == coordinator
    assert transition.was_forced is False


# ------------------------------------------------------------- illegal movement

@pytest.mark.parametrize(
    ("from_stage", "to_stage"),
    [
        (Stage.INTAKE, Stage.PERMITTING),
        (Stage.INTAKE, Stage.COMPLETE),
        (Stage.DESIGN, Stage.INSTALLATION),
        (Stage.PERMITTING, Stage.QA),
        (Stage.INSTALLATION, Stage.COMPLETE),
        (Stage.DESIGN, Stage.INTAKE),
        (Stage.PERMITTING, Stage.DESIGN),
        (Stage.INSTALLATION, Stage.PERMITTING),
    ],
)
def test_skipping_or_reversing_stages_is_rejected(make_job, admin_user, from_stage, to_stage):
    job = make_job(from_stage)

    # Admin is used deliberately: even the privileged role cannot bend the graph.
    with pytest.raises(IllegalTransition):
        transition_job(job=job, to_stage=to_stage, actor=admin_user)

    job.refresh_from_db()
    assert job.stage == from_stage
    assert StageTransition.objects.filter(job=job).count() == 0


@pytest.mark.parametrize("to_stage", [s for s in STAGE_ORDER if s != Stage.COMPLETE])
def test_complete_is_terminal_even_for_admin(make_job, admin_user, to_stage):
    job = make_job(Stage.COMPLETE)

    with pytest.raises(IllegalTransition):
        transition_job(job=job, to_stage=to_stage, actor=admin_user)


# ------------------------------------------------------------ stage ownership

@pytest.mark.parametrize(
    ("stage", "to_stage", "wrong_actor_fixture"),
    [
        (Stage.INTAKE, Stage.DESIGN, "designer"),
        (Stage.INTAKE, Stage.DESIGN, "field_tech"),
        (Stage.DESIGN, Stage.PERMITTING, "coordinator"),
        (Stage.DESIGN, Stage.PERMITTING, "field_tech"),
        (Stage.PERMITTING, Stage.INSTALLATION, "designer"),
        (Stage.INSTALLATION, Stage.QA, "coordinator"),
        (Stage.INSTALLATION, Stage.QA, "designer"),
        (Stage.QA, Stage.COMPLETE, "field_tech"),
    ],
)
def test_only_the_owning_role_may_advance_a_stage(
    make_job, request, stage, to_stage, wrong_actor_fixture
):
    job = make_job(stage)
    actor = request.getfixturevalue(wrong_actor_fixture)

    with pytest.raises(NotStageOwner):
        transition_job(job=job, to_stage=to_stage, actor=actor)

    job.refresh_from_db()
    assert job.stage == stage


def test_admin_may_force_a_transition_it_does_not_own(make_job, admin_user):
    job = make_job(Stage.DESIGN)  # owned by Designer

    transition = transition_job(job=job, to_stage=Stage.PERMITTING, actor=admin_user)

    job.refresh_from_db()
    assert job.stage == Stage.PERMITTING
    assert transition.was_forced is True


# ------------------------------------------------------------------- QA rework

def test_failed_qa_requires_a_reason(make_job, coordinator):
    job = make_job(Stage.QA)

    with pytest.raises(ReasonRequired):
        transition_job(job=job, to_stage=Stage.INSTALLATION, actor=coordinator)

    with pytest.raises(ReasonRequired):
        transition_job(job=job, to_stage=Stage.INSTALLATION, actor=coordinator, reason="   ")

    job.refresh_from_db()
    assert job.stage == Stage.QA


def test_failed_qa_sends_the_job_back_and_counts_rework(make_job, coordinator):
    job = make_job(Stage.QA)
    reason = "Inspection failed: grounding electrode conductor undersized."

    transition = transition_job(
        job=job, to_stage=Stage.INSTALLATION, actor=coordinator, reason=reason
    )

    job.refresh_from_db()
    assert job.stage == Stage.INSTALLATION
    assert job.rework_count == 1
    assert transition.reason == reason


def test_rework_count_accumulates_across_multiple_failures(
    make_job, coordinator, field_tech
):
    job = make_job(Stage.QA)

    for attempt in range(3):
        transition_job(
            job=job,
            to_stage=Stage.INSTALLATION,
            actor=coordinator,
            reason=f"Inspection failed, attempt {attempt}",
        )
        transition_job(job=job, to_stage=Stage.QA, actor=field_tech)

    job.refresh_from_db()
    assert job.rework_count == 3


def test_forward_transitions_do_not_count_as_rework(make_job, coordinator):
    job = make_job(Stage.QA)

    transition_job(job=job, to_stage=Stage.COMPLETE, actor=coordinator)

    job.refresh_from_db()
    assert job.rework_count == 0


# ----------------------------------------------------------------------- holds

def test_a_held_job_rejects_every_transition(make_job, coordinator, admin_user):
    job = make_job(Stage.INTAKE)
    set_hold(job=job, actor=coordinator, on_hold=True, reason="Awaiting customer decision")

    with pytest.raises(JobOnHold):
        transition_job(job=job, to_stage=Stage.DESIGN, actor=coordinator)

    # Not even Admin can move a held job — release it first.
    with pytest.raises(JobOnHold):
        transition_job(job=job, to_stage=Stage.DESIGN, actor=admin_user)


def test_releasing_a_hold_restores_movement(make_job, coordinator):
    job = make_job(Stage.INTAKE)
    set_hold(job=job, actor=coordinator, on_hold=True, reason="Roof repair required")
    set_hold(job=job, actor=coordinator, on_hold=False)

    transition_job(job=job, to_stage=Stage.DESIGN, actor=coordinator)

    job.refresh_from_db()
    assert job.stage == Stage.DESIGN
    assert job.hold_reason == ""


def test_hold_requires_a_reason(make_job, coordinator):
    job = make_job(Stage.INTAKE)

    with pytest.raises(ReasonRequired):
        set_hold(job=job, actor=coordinator, on_hold=True)


def test_only_coordinator_or_admin_may_hold(make_job, designer, field_tech):
    job = make_job(Stage.INTAKE)

    for actor in (designer, field_tech):
        with pytest.raises(NotStageOwner):
            set_hold(job=job, actor=actor, on_hold=True, reason="nope")


# ------------------------------------------------------- available transitions

def test_available_transitions_reflect_role_and_stage(
    make_job, coordinator, designer, field_tech, admin_user
):
    job = make_job(Stage.DESIGN)

    assert available_transitions(job=job, actor=designer) == [Stage.PERMITTING]
    assert available_transitions(job=job, actor=coordinator) == []
    assert available_transitions(job=job, actor=field_tech) == []
    assert available_transitions(job=job, actor=admin_user) == [Stage.PERMITTING]


def test_available_transitions_from_qa_include_the_rework_edge(make_job, coordinator):
    job = make_job(Stage.QA)

    assert available_transitions(job=job, actor=coordinator) == sorted(
        [Stage.COMPLETE, Stage.INSTALLATION]
    )


def test_a_held_job_offers_no_transitions(make_job, coordinator, admin_user):
    job = make_job(Stage.INTAKE)
    set_hold(job=job, actor=coordinator, on_hold=True, reason="Utility backlog")

    assert available_transitions(job=job, actor=coordinator) == []
    assert available_transitions(job=job, actor=admin_user) == []


def test_complete_offers_no_transitions(make_job, coordinator, admin_user):
    job = make_job(Stage.COMPLETE)

    assert available_transitions(job=job, actor=coordinator) == []
    assert available_transitions(job=job, actor=admin_user) == []
