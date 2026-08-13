"""Request correlation.

Every log line carries the id of the request that produced it, and the id goes back to
the client in a response header. When a user reports "it failed at 14:32", that id is
what turns a pile of interleaved log lines into one readable story.
"""

import logging
import time
import uuid
from contextvars import ContextVar

from django.utils.deprecation import MiddlewareMixin

REQUEST_ID_HEADER = "X-Request-ID"
_request_id: ContextVar[str] = ContextVar("request_id", default="-")

logger = logging.getLogger("installops.request")


def current_request_id() -> str:
    return _request_id.get()


class RequestIDFilter(logging.Filter):
    """Injects the id into every record so the formatter can print it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id()
        return True


class RequestLogMiddleware(MiddlewareMixin):
    """Assigns a request id, logs one line per request, and echoes the id back.

    A client-supplied id is honoured so a trace can span the browser and the API, but it
    is length-capped: it ends up in log output, and unbounded caller-controlled strings
    in logs are how log injection starts.
    """

    MAX_CLIENT_ID_LENGTH = 64

    def process_request(self, request) -> None:
        supplied = request.headers.get(REQUEST_ID_HEADER, "")
        request_id = (
            supplied[: self.MAX_CLIENT_ID_LENGTH] if supplied else uuid.uuid4().hex[:16]
        )
        request.request_id = request_id
        request._start_time = time.monotonic()
        _request_id.set(request_id)

    def process_response(self, request, response):
        request_id = getattr(request, "request_id", "-")
        response[REQUEST_ID_HEADER] = request_id

        started = getattr(request, "_start_time", None)
        if started is not None and not request.path.startswith("/static/"):
            duration_ms = (time.monotonic() - started) * 1000
            logger.info(
                "%s %s %s %.1fms user=%s",
                request.method,
                request.path,
                response.status_code,
                duration_ms,
                getattr(request.user, "username", "anonymous")
                if hasattr(request, "user")
                else "anonymous",
            )
        return response
