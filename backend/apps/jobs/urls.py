from rest_framework.routers import DefaultRouter

from .views import ChecklistItemViewSet, CustomerViewSet, JobViewSet

app_name = "jobs"

router = DefaultRouter()
router.register("jobs", JobViewSet, basename="job")
router.register("checklist-items", ChecklistItemViewSet, basename="checklist-item")
router.register("customers", CustomerViewSet, basename="customer")

urlpatterns = router.urls
