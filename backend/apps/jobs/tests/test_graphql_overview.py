"""The GraphQL overview query.

Its permission and scoping rules are tested separately from REST on purpose: a second
API surface is a second way to leak the same rows, so it gets its own coverage rather
than inheriting confidence from the viewset tests.
"""

import json

import pytest
from django.urls import reverse
from rest_framework_simplejwt.tokens import RefreshToken

from apps.jobs.constants import Stage

pytestmark = [pytest.mark.django_db, pytest.mark.integration]

QUERY = """
{
  overview {
    total
    overdue
    held
    rework
    stages { stage label count }
    recent { id jobNumber customerName stage }
  }
}
"""


def run_query(client, user=None, query: str = QUERY):
    headers = {}
    if user is not None:
        headers["authorization"] = f"Bearer {RefreshToken.for_user(user).access_token}"
    response = client.post(
        reverse("graphql"),
        data=json.dumps({"query": query}),
        content_type="application/json",
        headers=headers,
    )
    return response, response.json()


def error_message(payload: dict) -> str:
    return payload.get("errors", [{}])[0].get("message", "")


def overview_of(payload: dict):
    """GraphQL returns ``"data": null`` when the top-level field itself errored."""
    return (payload.get("data") or {}).get("overview")


# ------------------------------------------------------------------ permissions

def test_anonymous_callers_get_no_data(client, make_job):
    make_job()

    _, payload = run_query(client)

    assert overview_of(payload) is None
    assert "Authentication required" in error_message(payload)


@pytest.mark.parametrize("role_fixture", ["designer", "field_tech"])
def test_roles_without_overview_access_are_refused(client, make_job, request, role_fixture):
    make_job()
    user = request.getfixturevalue(role_fixture)

    _, payload = run_query(client, user)

    assert overview_of(payload) is None
    assert "does not have access" in error_message(payload)


@pytest.mark.parametrize("role_fixture", ["coordinator", "admin_user"])
def test_coordinator_and_admin_may_query_the_overview(
    client, make_job, request, role_fixture
):
    make_job()
    user = request.getfixturevalue(role_fixture)

    _, payload = run_query(client, user)

    assert "errors" not in payload
    assert payload["data"]["overview"]["total"] == 1


# ----------------------------------------------------------------------- counts

def test_counts_match_the_underlying_jobs(client, coordinator, make_job):
    make_job(Stage.INTAKE)
    make_job(Stage.INTAKE)
    make_job(Stage.PERMITTING)
    make_job(Stage.COMPLETE)

    _, payload = run_query(client, coordinator)
    overview = payload["data"]["overview"]
    by_stage = {entry["stage"]: entry["count"] for entry in overview["stages"]}

    assert overview["total"] == 4
    assert by_stage[Stage.INTAKE] == 2
    assert by_stage[Stage.PERMITTING] == 1
    assert by_stage[Stage.COMPLETE] == 1
    assert by_stage[Stage.DESIGN] == 0


def test_every_stage_is_present_even_at_zero(client, coordinator, make_job):
    """The rail renders six cards; a missing stage would leave a hole in the UI."""
    make_job(Stage.INTAKE)

    _, payload = run_query(client, coordinator)
    stages = payload["data"]["overview"]["stages"]

    assert [entry["stage"] for entry in stages] == list(Stage.values)


def test_held_and_rework_totals(client, coordinator, make_job):
    make_job(Stage.INTAKE, on_hold=True, hold_reason="Awaiting customer")
    make_job(Stage.INSTALLATION, rework_count=2)
    make_job(Stage.DESIGN)

    _, payload = run_query(client, coordinator)
    overview = payload["data"]["overview"]

    assert overview["held"] == 1
    assert overview["rework"] == 1


def test_completed_jobs_are_never_counted_as_overdue(client, coordinator, make_job):
    from datetime import timedelta

    from django.utils import timezone

    yesterday = timezone.now().date() - timedelta(days=1)
    make_job(Stage.COMPLETE, target_completion_date=yesterday)
    make_job(Stage.PERMITTING, target_completion_date=yesterday)

    _, payload = run_query(client, coordinator)

    assert payload["data"]["overview"]["overdue"] == 1


def test_recent_list_is_newest_first(client, coordinator, make_job):
    make_job(Stage.INTAKE)
    newest = make_job(Stage.DESIGN)
    newest.save()  # bumps updated_at

    _, payload = run_query(client, coordinator)
    recent = payload["data"]["overview"]["recent"]

    assert recent[0]["id"] == str(newest.id)
    assert recent[0]["jobNumber"] == newest.job_number
