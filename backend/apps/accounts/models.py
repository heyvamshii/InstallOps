from django.contrib.auth.models import AbstractUser
from django.db import models

from .constants import FULL_VISIBILITY_ROLES, PRIVILEGED_ROLES, Role


class User(AbstractUser):
    """Custom user carrying exactly one InstallOps role.

    Defined at scaffold time on purpose: swapping ``AUTH_USER_MODEL`` after the first
    migration is a painful, avoidable migration.
    """

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.COORDINATOR,
        db_index=True,
    )
    phone = models.CharField(max_length=32, blank=True)

    class Meta:
        ordering = ("username",)

    def __str__(self) -> str:
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_privileged(self) -> bool:
        return self.role in PRIVILEGED_ROLES

    @property
    def sees_all_jobs(self) -> bool:
        return self.role in FULL_VISIBILITY_ROLES
