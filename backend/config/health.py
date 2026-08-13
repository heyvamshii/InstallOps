"""Health endpoint.

Returns 200 only when the process can actually serve traffic — that means the database
answers and no migrations are outstanding. A health check that only proves the web
process is alive tells you nothing useful during a deploy.
"""

import os

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse


def health(request) -> JsonResponse:
    checks: dict[str, str] = {}
    healthy = True

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        checks["database"] = f"error: {exc.__class__.__name__}"
        healthy = False

    try:
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        checks["migrations"] = "ok" if not pending else f"{len(pending)} pending"
        healthy = healthy and not pending
    except Exception as exc:  # noqa: BLE001
        checks["migrations"] = f"error: {exc.__class__.__name__}"
        healthy = False

    return JsonResponse(
        {
            "status": "ok" if healthy else "degraded",
            "version": os.environ.get("APP_VERSION", "0.1.0"),
            "checks": checks,
        },
        status=200 if healthy else 503,
    )
