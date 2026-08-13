from drf_spectacular.utils import extend_schema
from rest_framework import generics, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.jobs.permissions import IsAdmin

from .models import User
from .serializers import (
    AdminUserSerializer,
    InstallOpsTokenObtainPairSerializer,
    UserSerializer,
)


class InstallOpsTokenObtainPairView(TokenObtainPairView):
    """POST username + password → access, refresh, and the serialized user."""

    serializer_class = InstallOpsTokenObtainPairSerializer


@extend_schema(responses=UserSerializer)
class MeView(generics.RetrieveUpdateAPIView):
    """The signed-in user. ``role`` is read-only — only Admin changes roles."""

    serializer_class = UserSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self) -> User:
        return self.request.user


class UserViewSet(viewsets.ModelViewSet):
    """Directory of active users.

    Readable by anyone signed in — the job table's "assigned tech" filter needs names.
    Writable only by Admin, which is what makes role assignment an admin capability.
    """

    queryset = User.objects.filter(is_active=True)
    filterset_fields = ("role",)
    search_fields = ("username", "first_name", "last_name")
    ordering = ("first_name", "username")
    pagination_class = None

    def get_serializer_class(self):
        return UserSerializer if self.action in {"list", "retrieve"} else AdminUserSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]
