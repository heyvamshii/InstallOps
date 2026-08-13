"""Role enum — LOCKED at 4. See docs/domain-model.md before changing anything here."""

from django.db import models


class Role(models.TextChoices):
    COORDINATOR = "COORDINATOR", "Coordinator"
    DESIGNER = "DESIGNER", "Designer"
    FIELD_TECH = "FIELD_TECH", "Field Tech"
    ADMIN = "ADMIN", "Admin"


#: Roles that bypass stage-ownership checks. Still cannot skip stages or exit COMPLETE.
PRIVILEGED_ROLES: frozenset[str] = frozenset({Role.ADMIN})

#: Roles that see every job. Everyone else is scoped in ``get_queryset()``.
FULL_VISIBILITY_ROLES: frozenset[str] = frozenset(
    {Role.COORDINATOR, Role.DESIGNER, Role.ADMIN}
)
