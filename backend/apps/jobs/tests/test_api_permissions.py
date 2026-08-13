"""The permission matrix, asserted through the API rather than the service layer.

The point of testing here as well as in ``test_transitions.py`` is that the UI is not
the boundary: these calls carry a valid token and are still rejected, which is what
makes "the button is hidden" irrelevant to security.
"""

import pytest
from django.urls import reverse

from apps.jobs.constants import Stage

pytestmark = [pytest.mark.django_db, pytest.mark.integration]


def job_url(job) -> str:
    return reverse("jobs:job-detail", args=[job.pk])


def transition_url(job) -> str:
    return reverse("jobs:job-transition", args=[job.pk])


def hold_url(job) -> str:
    return reverse("jobs:job-hold", args=[job.pk])


LIST_URL = reverse("jobs:job-list")


# ------------------------------------------------------------- authentication

def test_anonymous_requests_are_rejected(api_client, make_job):
    job = make_job()

    assert api_client.get(LIST_URL).status_code == 401
    assert api_client.get(job_url(job)).status_code == 401
    assert api_client.post(transition_url(job), {"to_stage": Stage.DESIGN}).status_code == 401


# ------------------------------------------------------------------- scoping

def test_field_tech_sees_only_their_own_jobs(auth, make_job, field_tech, other_field_tech):
    mine = make_job(assigned_tech=field_tech)
    theirs = make_job(assigned_tech=other_field_tech)

    response = auth(field_tech).get(LIST_URL)

    assert response.status_code == 200
    returned = {row["id"] for row in response.json()["results"]}
    assert returned == {mine.id}
    assert theirs.id not in returned


def test_field_tech_cannot_reach_another_techs_job_by_id(
    auth, make_job, field_tech, other_field_tech
):
    theirs = make_job(assigned_tech=other_field_tech)

    # 404, not 403 — the object was never in the queryset, so its existence isn't leaked.
    assert auth(field_tech).get(job_url(theirs)).status_code == 404


def test_field_tech_cannot_transition_another_techs_job(
    auth, make_job, field_tech, other_field_tech
):
    theirs = make_job(Stage.INSTALLATION, assigned_tech=other_field_tech)

    response = auth(field_tech).post(transition_url(theirs), {"to_stage": Stage.QA})

    assert response.status_code == 404
    theirs.refresh_from_db()
    assert theirs.stage == Stage.INSTALLATION


@pytest.mark.parametrize("role_fixture", ["coordinator", "designer", "admin_user"])
def test_full_visibility_roles_see_every_job(
    auth, make_job, request, role_fixture, field_tech, other_field_tech
):
    make_job(assigned_tech=field_tech)
    make_job(assigned_tech=other_field_tech)
    user = request.getfixturevalue(role_fixture)

    response = auth(user).get(LIST_URL)

    assert response.json()["count"] == 2


# ------------------------------------------------------------------- creation

@pytest.mark.parametrize(
    ("role_fixture", "expected"),
    [("coordinator", 201), ("admin_user", 201), ("designer", 403), ("field_tech", 403)],
)
def test_only_coordinator_and_admin_may_create_jobs(
    auth, request, customer, role_fixture, expected
):
    user = request.getfixturevalue(role_fixture)
    payload = {
        "customer": customer.pk,
        "site_address": "44 Sagebrush Ct",
        "site_city": "Austin",
        "site_state": "TX",
        "site_postal_code": "78701",
    }

    response = auth(user).post(LIST_URL, payload)

    assert response.status_code == expected


def test_a_created_job_starts_in_intake_with_a_number_and_checklist(
    auth, coordinator, customer
):
    response = auth(coordinator).post(
        LIST_URL,
        {
            "customer": customer.pk,
            "site_address": "44 Sagebrush Ct",
            "site_city": "Austin",
            "site_state": "TX",
            "site_postal_code": "78701",
        },
    )

    body = response.json()
    assert body["stage"] == Stage.INTAKE
    assert body["job_number"].startswith("SOL-")
    assert len(body["checklist_items"]) > 0
    assert body["rework_count"] == 0


def test_stage_cannot_be_set_through_the_write_endpoint(auth, coordinator, make_job):
    """Stage moves only through /transition/ — otherwise the audit trail has holes."""
    job = make_job(Stage.INTAKE)

    response = auth(coordinator).patch(job_url(job), {"stage": Stage.COMPLETE})

    assert response.status_code == 200
    job.refresh_from_db()
    assert job.stage == Stage.INTAKE


# ---------------------------------------------------------------- transitions

@pytest.mark.parametrize(
    ("stage", "to_stage", "role_fixture", "expected"),
    [
        # Owner of the current stage succeeds
        (Stage.INTAKE, Stage.DESIGN, "coordinator", 200),
        (Stage.DESIGN, Stage.PERMITTING, "designer", 200),
        (Stage.PERMITTING, Stage.INSTALLATION, "coordinator", 200),
        (Stage.INSTALLATION, Stage.QA, "field_tech", 200),
        (Stage.QA, Stage.COMPLETE, "coordinator", 200),
        # Admin overrides everywhere
        (Stage.DESIGN, Stage.PERMITTING, "admin_user", 200),
        (Stage.INSTALLATION, Stage.QA, "admin_user", 200),
        # Wrong role is refused
        (Stage.INTAKE, Stage.DESIGN, "designer", 403),
        (Stage.DESIGN, Stage.PERMITTING, "coordinator", 403),
        (Stage.INSTALLATION, Stage.QA, "coordinator", 403),
        (Stage.QA, Stage.COMPLETE, "field_tech", 403),
    ],
)
def test_transition_permission_matrix(
    auth, make_job, request, field_tech, stage, to_stage, role_fixture, expected
):
    job = make_job(stage, assigned_tech=field_tech)
    user = request.getfixturevalue(role_fixture)

    response = auth(user).post(transition_url(job), {"to_stage": to_stage})

    assert response.status_code == expected


def test_illegal_transition_returns_a_typed_error_code(auth, coordinator, make_job):
    job = make_job(Stage.INTAKE)

    response = auth(coordinator).post(transition_url(job), {"to_stage": Stage.COMPLETE})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "illegal_transition"


def test_missing_reason_returns_a_typed_error_code(auth, coordinator, make_job):
    job = make_job(Stage.QA)

    response = auth(coordinator).post(transition_url(job), {"to_stage": Stage.INSTALLATION})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "reason_required"


def test_held_job_returns_a_typed_error_code(auth, coordinator, make_job):
    job = make_job(Stage.INTAKE)
    auth(coordinator).post(hold_url(job), {"on_hold": True, "reason": "Utility backlog"})

    response = auth(coordinator).post(transition_url(job), {"to_stage": Stage.DESIGN})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "job_on_hold"


def test_wrong_role_returns_a_typed_error_code(auth, designer, make_job):
    job = make_job(Stage.INTAKE)

    response = auth(designer).post(transition_url(job), {"to_stage": Stage.DESIGN})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_stage_owner"


def test_successful_transition_returns_the_updated_job_with_history(
    auth, coordinator, make_job
):
    job = make_job(Stage.INTAKE)

    body = auth(coordinator).post(transition_url(job), {"to_stage": Stage.DESIGN}).json()

    assert body["stage"] == Stage.DESIGN
    assert len(body["transitions"]) == 1
    assert body["transitions"][0]["to_stage"] == Stage.DESIGN


# ----------------------------------------------------------------------- holds

@pytest.mark.parametrize(
    ("role_fixture", "expected"),
    [("coordinator", 200), ("admin_user", 200), ("designer", 403), ("field_tech", 403)],
)
def test_only_coordinator_and_admin_may_hold(
    auth, make_job, request, field_tech, role_fixture, expected
):
    job = make_job(assigned_tech=field_tech)
    user = request.getfixturevalue(role_fixture)

    response = auth(user).post(hold_url(job), {"on_hold": True, "reason": "Roof repair"})

    assert response.status_code == expected


# -------------------------------------------------------- available_transitions

def test_detail_exposes_only_the_callers_available_transitions(
    auth, make_job, designer, coordinator
):
    job = make_job(Stage.DESIGN)

    assert auth(designer).get(job_url(job)).json()["available_transitions"] == [
        Stage.PERMITTING
    ]
    assert auth(coordinator).get(job_url(job)).json()["available_transitions"] == []
