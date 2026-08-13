from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "phone",
        )
        read_only_fields = ("id", "role")

    def get_full_name(self, obj: User) -> str:
        return obj.get_full_name() or obj.username


class AdminUserSerializer(UserSerializer):
    """Role is writable here and nowhere else.

    ``UserSerializer`` keeps ``role`` read-only precisely because ``/api/auth/me/`` uses
    it — without that, any user could PATCH themselves to ADMIN.
    """

    class Meta(UserSerializer.Meta):
        read_only_fields = ("id",)


class InstallOpsTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds the role to the token claims and the user object to the login response.

    The claim saves the client a round trip on boot; ``/api/auth/me/`` remains the
    authority, because a claim is only as fresh as the token that carries it.
    """

    @classmethod
    def get_token(cls, user: User):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs: dict) -> dict:
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
