"""Typed domain errors and the DRF handler that renders them.

Every rejection the client can act on carries a stable ``code``, so the Angular side
branches on a machine value instead of parsing English.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class DomainError(Exception):
    """Base class for rule violations that are the caller's fault, not a bug."""

    code = "domain_error"
    status_code = status.HTTP_400_BAD_REQUEST
    default_message = "The request violates a domain rule."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)
        self.message = message or self.default_message


class IllegalTransition(DomainError):
    code = "illegal_transition"
    status_code = status.HTTP_409_CONFLICT
    default_message = "That stage transition is not allowed."


class NotStageOwner(DomainError):
    code = "not_stage_owner"
    status_code = status.HTTP_403_FORBIDDEN
    default_message = "Your role does not own the job's current stage."


class JobOnHold(DomainError):
    code = "job_on_hold"
    status_code = status.HTTP_409_CONFLICT
    default_message = "The job is on hold and cannot be transitioned."


class ReasonRequired(DomainError):
    code = "reason_required"
    status_code = status.HTTP_400_BAD_REQUEST
    default_message = "This transition requires a reason."


def typed_exception_handler(exc: Exception, context: dict):
    if isinstance(exc, DomainError):
        return Response(
            {"error": {"code": exc.code, "message": exc.message}},
            status=exc.status_code,
        )
    return drf_exception_handler(exc, context)
