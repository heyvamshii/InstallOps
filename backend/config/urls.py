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
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.dashboard.schema import schema
from apps.dashboard.views import JWTGraphQLView

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
    # Bearer-token authenticated, so CSRF does not apply.
    path("graphql/", csrf_exempt(JWTGraphQLView.as_view(schema=schema)), name="graphql"),
]
