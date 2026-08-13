"""Human-readable job numbers: ``SOL-2026-0001``.

Sequential per calendar year. The number is generated inside the caller's transaction;
the ``unique`` constraint on ``Job.job_number`` is the real guard against the
read-then-write race, and ``create_job`` retries on collision. A dedicated sequence
table would be the answer at real concurrency — at this write volume it would be
ceremony.
"""

from django.db.models import IntegerField, Max
from django.db.models.functions import Cast, Substr
from django.utils import timezone

JOB_NUMBER_PREFIX = "SOL"
SEQUENCE_DIGITS = 4


def generate_job_number(year: int | None = None) -> str:
    from .models import Job

    year = year or timezone.now().year
    prefix = f"{JOB_NUMBER_PREFIX}-{year}-"

    # The suffix is cast to an integer before taking the maximum. A plain Max() over the
    # CharField compares lexicographically, where "SOL-2026-9999" sorts above
    # "SOL-2026-10000" — so the sequence would stall and collide forever past 9999.
    latest = (
        Job.objects.filter(job_number__startswith=prefix)
        .annotate(
            sequence=Cast(Substr("job_number", len(prefix) + 1), output_field=IntegerField())
        )
        .aggregate(latest=Max("sequence"))
        .get("latest")
    )

    next_sequence = (latest or 0) + 1
    return f"{prefix}{next_sequence:0{SEQUENCE_DIGITS}d}"
