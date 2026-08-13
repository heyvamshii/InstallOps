import { HttpErrorResponse } from '@angular/common/http';

import { domainErrorFrom, userMessageFrom } from './api-error';

function httpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, url: '/api/jobs/1/transition/' });
}

describe('domainErrorFrom', () => {
  it('extracts the typed error the backend emits', () => {
    const error = httpError(409, {
      error: { code: 'illegal_transition', message: 'Cannot move SOL-1 from INTAKE to QA.' },
    });

    expect(domainErrorFrom(error)).toEqual({
      code: 'illegal_transition',
      message: 'Cannot move SOL-1 from INTAKE to QA.',
    });
  });

  it('returns null for a plain DRF validation error', () => {
    expect(domainErrorFrom(httpError(400, { to_stage: ['Invalid choice.'] }))).toBeNull();
  });

  it('returns null for a non-HTTP failure', () => {
    expect(domainErrorFrom(new Error('boom'))).toBeNull();
    expect(domainErrorFrom(null)).toBeNull();
  });
});

describe('userMessageFrom', () => {
  it('prefers the domain message, so the user sees why the rule fired', () => {
    const error = httpError(400, {
      error: { code: 'reason_required', message: 'Moving SOL-1 back requires a reason.' },
    });

    expect(userMessageFrom(error)).toBe('Moving SOL-1 back requires a reason.');
  });

  it('explains a dead connection rather than showing status 0', () => {
    expect(userMessageFrom(httpError(0, null))).toBe(
      'Cannot reach the server. Check your connection.',
    );
  });

  it('maps the common auth statuses to plain language', () => {
    expect(userMessageFrom(httpError(401, null))).toContain('session expired');
    expect(userMessageFrom(httpError(403, null))).toContain('permission');
    expect(userMessageFrom(httpError(404, null))).toContain('not available');
  });

  it('surfaces the first field error from a DRF validation response', () => {
    expect(userMessageFrom(httpError(400, { site_state: ['This field is required.'] }))).toBe(
      'This field is required.',
    );
  });

  it('falls back to DRF detail when there are no field errors', () => {
    expect(userMessageFrom(httpError(405, { detail: 'Method "PUT" not allowed.' }))).toBe(
      'Method "PUT" not allowed.',
    );
  });

  it('uses the caller fallback when nothing else is intelligible', () => {
    expect(userMessageFrom(new Error('boom'), 'Could not save.')).toBe('Could not save.');
  });
});
