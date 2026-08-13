from drf_spectacular.utils import extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.jobs.permissions import IsAdmin

from .models import User
from .serializers import (
    AdminUserSerializer,
    DirectoryUserSerializer,
    InstallOpsTokenObtainPairSerializer,
    LogoutSerializer,
    UserSerializer,
)


class InstallOpsTokenObtainPairView(TokenObtainPairView):
    """POST username + password → access, refresh, and the serialized user."""

    serializer_class = InstallOpsTokenObtainPairSerializer


@extend_schema(request=LogoutSerializer, responses={205: None})
class LogoutView(APIView):
    """Revoke a refresh token server-side.

    Clearing the client's storage alone leaves the token valid for its full lifetime, so
    a token captured before sign-out would still work. Blacklisting closes that window.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError:
            # Already expired, already blacklisted, or malformed. The caller's intent —
            # end this session — is satisfied either way, so this is not an error.
            pass

        return Response(status=status.HTTP_205_RESET_CONTENT)


@extend_schema(responses=UserSerializer)
class MeView(generics.RetrieveUpdateAPIView):
    """The signed-in user. ``role`` is read-only — only Admin changes roles."""

    serializer_class = UserSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self) -> User:
        return self.request.user


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Directory of active users.

    Read-only for anyone signed in, and only in the slim directory shape. Admin may
    change a role, which is the whole of "manage users" in this system.

    Deliberately no create: without a password field there is no way to make an account
    that can actually sign in, so account creation stays in the Django admin rather than
    offering an endpoint that silently produces unusable users.
    """

    queryset = User.objects.filter(is_active=True)
    filterset_fields = ("role",)
    search_fields = ("username", "first_name", "last_name")
    ordering = ("first_name", "username")
    pagination_class = None  # Bounded by the size of one company's active roster.

    def get_serializer_class(self):
        if self.action in {"list", "retrieve"}:
            return DirectoryUserSerializer
        return AdminUserSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]
