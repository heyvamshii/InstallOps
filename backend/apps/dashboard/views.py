"""GraphQL endpoint.

Strawberry's view is a plain Django view, so it does not go through DRF's authentication.
This subclass runs the same JWT authenticator the REST API uses before dispatching, so
both surfaces answer to one token and one identity — a second auth path would be a second
thing to get wrong.
"""

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from strawberry.django.views import GraphQLView


class JWTGraphQLView(GraphQLView):
    """Authenticates with the same JWT the REST API uses.

    The GraphiQL explorer is served only in development. In production it would hand any
    anonymous visitor an interactive client and the full schema — reconnaissance an
    attacker should have to work for.
    """

    authenticator = JWTAuthentication()
    graphql_ide = "graphiql" if settings.DEBUG else None

    def dispatch(self, request, *args, **kwargs):
        request.user = self._authenticate(request)
        return super().dispatch(request, *args, **kwargs)

    def _authenticate(self, request):
        try:
            result = self.authenticator.authenticate(request)
        except (InvalidToken, TokenError):
            return AnonymousUser()
        return result[0] if result else AnonymousUser()
