"""Regression tests for the controls added after the security review.

Each test here exists because the behaviour it asserts was once wrong, or was never
enforced. They are the reason to trust the permission matrix rather than the code
merely looking careful.
"""

import pytest
from django.urls import reverse

from apps.jobs.constants import Stage
from apps.jobs.models import Customer

pytestmark = [pytest.mark.django_db, pytest.mark.integration]

CUSTOMERS_URL = reverse("jobs:customer-list")
USERS_URL = reverse("accounts:user-list")


# --------------------------------------------------------- customer PII scoping

def test_field_tech_sees_only_customers_on_their_own_jobs(
    auth, make_job, field_tech, other_field_tech, customer
):
    """Customers carry email, phone, and billing address.

    Scoping jobs but not customers would leak the whole customer book sideways.
    """
    someone_elses = Customer.objects.create(
        name="Ximena Petrov", email="x@example.com", phone="555-0100"
    )
    make_job(assigned_tech=field_tech, customer=customer)
    make_job(assigned_tech=other_field_tech, customer=someone_elses)

    response = auth(field_tech).get(CUSTOMERS_URL)

    names = {row["name"] for row in response.json()["results"]}
    assert names == {customer.name}
    assert "Ximena Petrov" not in names


def test_field_tech_cannot_open_an_unrelated_customer_by_id(
    auth, make_job, field_tech, other_field_tech
):
    theirs = Customer.objects.create(name="Ximena Petrov", email="x@example.com")
    make_job(assigned_tech=other_field_tech, customer=theirs)

    url = reverse("jobs:customer-detail", args=[theirs.pk])

    assert auth(field_tech).get(url).status_code == 404


@pytest.mark.parametrize("role_fixture", ["coordinator", "designer", "admin_user"])
def test_full_visibility_roles_see_the_whole_customer_book(
    auth, make_job, request, role_fixture, customer
):
    Customer.objects.create(name="Ximena Petrov")
    make_job(customer=customer)
    user = request.getfixturevalue(role_fixture)

    assert auth(user).get(CUSTOMERS_URL).json()["count"] == 2


# ------------------------------------------------------------- directory privacy

def test_user_directory_does_not_expose_colleagues_contact_details(auth, field_tech):
    """A filter dropdown needs a name and an id, not everyone's phone number."""
    response = auth(field_tech).get(USERS_URL)

    assert response.status_code == 200
    for row in response.json():
        assert set(row) == {"id", "username", "full_name", "role"}


def test_only_admin_may_change_a_role(auth, coordinator, designer, admin_user):
    url = reverse("accounts:user-detail", args=[designer.pk])

    assert auth(coordinator).patch(url, {"role": "ADMIN"}).status_code == 403

    assert auth(admin_user).patch(url, {"role": "COORDINATOR"}).status_code == 200
    designer.refresh_from_db()
    assert designer.role == "COORDINATOR"


def test_a_user_cannot_promote_themselves_through_the_me_endpoint(auth, field_tech):
    response = auth(field_tech).patch(reverse("accounts:me"), {"role": "ADMIN"})

    assert response.status_code == 200  # the write succeeds, the role is simply ignored
    field_tech.refresh_from_db()
    assert field_tech.role == "FIELD_TECH"


# --------------------------------------------------------- checklist ownership

def test_a_designer_cannot_tick_off_a_coordinators_qa_checklist(
    auth, make_job, designer, coordinator
):
    """Items for all six stages exist from creation, so queryset scoping is not enough."""
    job = make_job(Stage.QA)
    qa_item = job.checklist_items.filter(stage=Stage.QA).first()
    url = reverse("jobs:checklist-item-toggle", args=[qa_item.pk])

    response = auth(designer).post(url)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_stage_owner"
    qa_item.refresh_from_db()
    assert qa_item.is_done is False


def test_a_field_tech_may_tick_their_own_installation_checklist(auth, make_job, field_tech):
    job = make_job(Stage.INSTALLATION, assigned_tech=field_tech)
    item = job.checklist_items.filter(stage=Stage.INSTALLATION).first()

    response = auth(field_tech).post(reverse("jobs:checklist-item-toggle", args=[item.pk]))

    assert response.status_code == 200
    item.refresh_from_db()
    assert item.is_done is True
    assert item.completed_by == field_tech


def test_a_field_tech_cannot_tick_items_for_stages_they_do_not_own(
    auth, make_job, field_tech
):
    job = make_job(Stage.INSTALLATION, assigned_tech=field_tech)
    permit_item = job.checklist_items.filter(stage=Stage.PERMITTING).first()

    response = auth(field_tech).post(
        reverse("jobs:checklist-item-toggle", args=[permit_item.pk])
    )

    assert response.status_code == 403


def test_an_admin_may_tick_any_stages_checklist(auth, make_job, admin_user):
    job = make_job(Stage.QA)
    item = job.checklist_items.filter(stage=Stage.DESIGN).first()

    response = auth(admin_user).post(reverse("jobs:checklist-item-toggle", args=[item.pk]))

    assert response.status_code == 200


# ------------------------------------------------------------- document uploads

def test_a_field_tech_cannot_upload_a_design_package(auth, make_job, field_tech):
    job = make_job(Stage.INSTALLATION, assigned_tech=field_tech)

    response = auth(field_tech).post(
        reverse("jobs:job-documents", args=[job.pk]),
        {"kind": "DESIGN_PACKAGE", "stage": Stage.DESIGN, "original_name": "plans.pdf"},
    )

    assert response.status_code == 400
    assert "role cannot upload" in str(response.json())


def test_a_field_tech_may_upload_a_site_photo(auth, make_job, field_tech):
    job = make_job(Stage.INSTALLATION, assigned_tech=field_tech)

    response = auth(field_tech).post(
        reverse("jobs:job-documents", args=[job.pk]),
        {"kind": "SITE_PHOTO", "stage": Stage.INSTALLATION, "original_name": "array.jpg"},
    )

    assert response.status_code == 201


def test_a_designer_may_upload_a_design_package(auth, make_job, designer):
    job = make_job(Stage.DESIGN)

    response = auth(designer).post(
        reverse("jobs:job-documents", args=[job.pk]),
        {"kind": "DESIGN_PACKAGE", "stage": Stage.DESIGN, "original_name": "plans.pdf"},
    )

    assert response.status_code == 201


# --------------------------------------------------------------------- sign-out

def test_logout_revokes_the_refresh_token_server_side(api_client, coordinator):
    """Clearing client storage is not sign-out if the token still works."""
    tokens = api_client.post(
        reverse("accounts:token-obtain-pair"),
        {"username": coordinator.username, "password": "test-pass-12345"},
        format="json",
    ).json()

    api_client.force_authenticate(user=coordinator)
    assert (
        api_client.post(reverse("accounts:logout"), {"refresh": tokens["refresh"]}).status_code
        == 205
    )

    api_client.force_authenticate(user=None)
    replay = api_client.post(
        reverse("accounts:token-refresh"), {"refresh": tokens["refresh"]}, format="json"
    )
    assert replay.status_code == 401


def test_logout_requires_authentication(api_client):
    assert api_client.post(reverse("accounts:logout"), {"refresh": "anything"}).status_code == 401
