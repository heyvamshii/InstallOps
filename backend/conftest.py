"""Shared fixtures.

One user per role, plus a second Field Tech — scoping bugs only show up when there is
somebody else's job to accidentally expose.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.constants import Role
from apps.jobs.constants import Stage
from apps.jobs.models import Customer, Job
from apps.jobs.services import seed_checklist


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def make_user(db, django_user_model):
    def _make_user(role: str, username: str | None = None, **kwargs):
        username = username or f"{role.lower()}-user"
        return django_user_model.objects.create_user(
            username=username,
            password="test-pass-12345",
            role=role,
            first_name=role.title(),
            last_name="User",
            **kwargs,
        )

    return _make_user


@pytest.fixture
def coordinator(make_user):
    return make_user(Role.COORDINATOR)


@pytest.fixture
def designer(make_user):
    return make_user(Role.DESIGNER)


@pytest.fixture
def field_tech(make_user):
    return make_user(Role.FIELD_TECH, username="tech-one")


@pytest.fixture
def other_field_tech(make_user):
    return make_user(Role.FIELD_TECH, username="tech-two")


@pytest.fixture
def admin_user(make_user):
    return make_user(Role.ADMIN)


@pytest.fixture
def customer(db) -> Customer:
    return Customer.objects.create(name="Rosa Alvarez", email="rosa@example.com")


@pytest.fixture
def make_job(db, customer, coordinator, designer, field_tech):
    def _make_job(stage: str = Stage.INTAKE, **kwargs) -> Job:
        defaults = {
            "customer": customer,
            "stage": stage,
            "site_address": "812 Larkspur Ave",
            "site_city": "Fremont",
            "site_state": "CA",
            "site_postal_code": "94536",
            "created_by": coordinator,
            "assigned_designer": designer,
            "assigned_tech": field_tech,
        }
        job = Job.objects.create(**{**defaults, **kwargs})
        seed_checklist(job)
        return job

    return _make_job


@pytest.fixture
def auth(api_client):
    """Authenticate the shared client as a given user and return it."""

    def _auth(user) -> APIClient:
        api_client.force_authenticate(user=user)
        return api_client

    return _auth
