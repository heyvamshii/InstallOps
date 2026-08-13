"""Per-action role permissions, mirroring docs/domain-model.md section 3.

Transition *ownership* is not checked here — that lives in ``services.transition_job``,
because it depends on the job's current stage, not just the actor's role. This class
covers the coarser question: may this role attempt this kind of action at all.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.constants import Role

#: action -> roles permitted to attempt it.
#:
#: Every write action is listed explicitly. An action absent from this map falls through
#: to "any authenticated user", which is a silent way to grant access — so new write
#: actions must be added here deliberately.
ACTION_ROLES: dict[str, frozenset[str]] = {
    "create": frozenset({Role.COORDINATOR, Role.ADMIN}),
    "update": frozenset({Role.COORDINATOR, Role.ADMIN}),
    "partial_update": frozenset({Role.COORDINATOR, Role.ADMIN}),
    "destroy": frozenset({Role.ADMIN}),
    "hold": frozenset({Role.COORDINATOR, Role.ADMIN}),
    "dashboard": frozenset({Role.COORDINATOR, Role.ADMIN}),
    # Anyone who can see a job may annotate it; the queryset is the real boundary.
    "notes": frozenset({Role.COORDINATOR, Role.DESIGNER, Role.FIELD_TECH, Role.ADMIN}),
    "documents": frozenset({Role.COORDINATOR, Role.DESIGNER, Role.FIELD_TECH, Role.ADMIN}),
}


class JobPermission(BasePermission):
    """Reads are open to any authenticated user; writes are role-gated.

    Read access is still *scoped* — a Field Tech may call list, but ``get_queryset``
    limits it to their own jobs.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False

        if request.method in SAFE_METHODS:
            return True

        allowed = ACTION_ROLES.get(getattr(view, "action", ""))
        return user.role in allowed if allowed else True


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.ADMIN)
