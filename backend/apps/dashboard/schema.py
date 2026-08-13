"""GraphQL schema — one aggregate query behind the overview screen.

Scoped deliberately to this single screen. The overview needs six stage counts, three
totals, and a recent-activity list; over REST that is ten requests the browser makes in
parallel and then has to stitch together. Here it is one request, and on the server it
collapses to two database queries: one conditional aggregation and one list.

The rest of the application stays on REST, where per-resource CRUD with DRF's filtering
and permissions is the better fit.
"""

from datetime import date

import strawberry
from django.conf import settings
from django.db.models import Count, Q, QuerySet
from django.utils import timezone
from strawberry.extensions import DisableIntrospection
from strawberry.types import Info

from apps.accounts.constants import Role
from apps.jobs.constants import STAGE_ORDER, Stage
from apps.jobs.models import Job

RECENT_LIMIT = 8


@strawberry.type
class StageCount:
    stage: str
    label: str
    count: int


@strawberry.type
class RecentJob:
    id: strawberry.ID
    job_number: str
    customer_name: str
    stage: str
    site_city: str
    site_state: str
    on_hold: bool


@strawberry.type
class Overview:
    stages: list[StageCount]
    overdue: int
    held: int
    rework: int
    total: int
    recent: list[RecentJob]


class NotPermitted(Exception):
    """Surfaces as a GraphQL error with this message."""


def visible_jobs(user) -> QuerySet[Job]:
    """Same scoping rule the REST viewset applies.

    A second entry point into the data is a second chance to leak it, so the rule is
    applied here too rather than assumed from the caller.
    """
    queryset = Job.objects.all()
    if not user.sees_all_jobs:
        queryset = queryset.filter(assigned_tech=user)
    return queryset


@strawberry.type
class Query:
    @strawberry.field(description="Everything the overview screen needs, in one request.")
    def overview(self, info: Info) -> Overview:
        user = info.context.request.user

        if not user.is_authenticated:
            raise NotPermitted("Authentication required.")
        if user.role not in {Role.COORDINATOR, Role.ADMIN}:
            raise NotPermitted("Your role does not have access to the overview.")

        jobs = visible_jobs(user)
        today: date = timezone.now().date()

        # One round trip to the database for every count on the screen.
        totals = jobs.aggregate(
            total=Count("id"),
            overdue=Count(
                "id",
                filter=Q(target_completion_date__lt=today) & ~Q(stage=Stage.COMPLETE),
            ),
            held=Count("id", filter=Q(on_hold=True)),
            rework=Count("id", filter=Q(rework_count__gt=0)),
            **{
                f"stage_{stage.lower()}": Count("id", filter=Q(stage=stage))
                for stage in STAGE_ORDER
            },
        )

        recent = [
            RecentJob(
                id=strawberry.ID(str(job.id)),
                job_number=job.job_number,
                customer_name=job.customer.name,
                stage=job.stage,
                site_city=job.site_city,
                site_state=job.site_state,
                on_hold=job.on_hold,
            )
            for job in jobs.select_related("customer").order_by("-updated_at")[:RECENT_LIMIT]
        ]

        return Overview(
            stages=[
                StageCount(
                    stage=stage,
                    label=Stage(stage).label,
                    count=totals[f"stage_{stage.lower()}"],
                )
                for stage in STAGE_ORDER
            ],
            overdue=totals["overdue"],
            held=totals["held"],
            rework=totals["rework"],
            total=totals["total"],
            recent=recent,
        )


def _extensions() -> list:
    """Introspection is disabled outside development.

    The schema is not a secret, but publishing a machine-readable map of every type and
    field to anonymous callers is free reconnaissance.
    """
    if settings.DEBUG:
        return []
    return [DisableIntrospection()]


schema = strawberry.Schema(query=Query, extensions=_extensions())
