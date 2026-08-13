"""Human-readable job numbers: ``SOL-2026-0001``.

Sequential per calendar year. The number is generated inside the caller's transaction
by reading the current maximum; the ``unique`` constraint on ``Job.job_number`` is the
real guard against the read-then-write race, and ``create_job`` retries on collision.
A dedicated sequence table would be the answer at real concurrency — at this write
volume it would be ceremony.
"""

from django.db.models import Max
from django.utils import timezone

JOB_NUMBER_PREFIX = "SOL"


def generate_job_number(year: int | None = None) -> str:
    from .models import Job

    year = year or timezone.now().year
    prefix = f"{JOB_NUMBER_PREFIX}-{year}-"

    latest = (
        Job.objects.filter(job_number__startswith=prefix)
        .aggregate(latest=Max("job_number"))
        .get("latest")
    )

    next_sequence = int(latest.rsplit("-", 1)[1]) + 1 if latest else 1
    return f"{prefix}{next_sequence:04d}"
