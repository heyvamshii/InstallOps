"""Root URL configuration for InstallOps.

Route groups:

    /api/auth/     JWT issue / refresh / current user
    /api/          REST resources (jobs, transitions, documents, checklist, notes)
    /graphql/      single aggregate query backing the dashboard screen
    /api/schema/   OpenAPI schema + Swagger UI
    /health/       liveness + dependency check for the deploy target
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .health import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.jobs.urls")),
    # TODO: path("graphql/", AsyncGraphQLView.as_view(schema=schema)),
]
