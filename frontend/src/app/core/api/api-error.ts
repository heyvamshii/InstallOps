import { HttpErrorResponse } from '@angular/common/http';

/** Stable codes emitted by backend/apps/jobs/exceptions.py. */
export type DomainErrorCode =
  | 'illegal_transition'
  | 'not_stage_owner'
  | 'job_on_hold'
  | 'reason_required'
  | 'domain_error';

export interface DomainError {
  code: DomainErrorCode | string;
  message: string;
}

/**
 * Pull the typed domain error out of a failed response.
 *
 * Branching on `code` rather than on the message text is the whole reason the backend
 * emits one — the copy can change without breaking the client.
 */
export function domainErrorFrom(error: unknown): DomainError | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const payload = error.error as { error?: DomainError } | null;
  return payload?.error?.code ? payload.error : null;
}

/** Message safe to show a user, whatever went wrong. */
export function userMessageFrom(error: unknown, fallback = 'Something went wrong.'): string {
  const domain = domainErrorFrom(error);
  if (domain) return domain.message;

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Check your connection.';
    if (error.status === 401) return 'Your session expired. Sign in again.';
    if (error.status === 403) return 'You do not have permission to do that.';
    if (error.status === 404) return 'That job is not available to you.';

    const body = error.error as Record<string, unknown> | null;
    if (body && typeof body === 'object') {
      const firstField = Object.values(body).find(
        (value) => Array.isArray(value) && typeof value[0] === 'string',
      ) as string[] | undefined;
      if (firstField) return firstField[0];
      if (typeof body['detail'] === 'string') return body['detail'] as string;
    }
  }
  return fallback;
}
