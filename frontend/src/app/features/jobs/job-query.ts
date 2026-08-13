import { Params } from '@angular/router';

import { DEFAULT_JOB_QUERY, JobQuery, Priority } from '../../core/domain/api.model';
import { STAGES, Stage } from '../../core/domain/job.model';

const PRIORITIES: readonly Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/**
 * The URL is the single source of truth for table state.
 *
 * Everything the table shows is reconstructible from these two pure functions, which is
 * what makes a filtered view shareable, refresh-safe, and correct under the back button.
 * They are pure on purpose — no router, no HTTP — so they are cheap to test.
 */

function asArray(value: string | string[] | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseTriState(value: unknown): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export function parseJobQuery(params: Params): JobQuery {
  const page = Number.parseInt(String(params['page'] ?? '1'), 10);
  const tech = params['tech'] !== undefined ? Number.parseInt(String(params['tech']), 10) : NaN;

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    ordering: typeof params['ordering'] === 'string' ? params['ordering'] : DEFAULT_JOB_QUERY.ordering,
    search: typeof params['q'] === 'string' ? params['q'] : '',
    stage: asArray(params['stage']).filter((value): value is Stage =>
      (STAGES as readonly string[]).includes(value),
    ),
    priority: asArray(params['priority']).filter((value): value is Priority =>
      (PRIORITIES as readonly string[]).includes(value),
    ),
    assigned_tech: Number.isFinite(tech) ? tech : null,
    on_hold: parseTriState(params['hold']),
    overdue: parseTriState(params['overdue']),
    has_rework: parseTriState(params['rework']),
  };
}

/**
 * Serialise back to query params, dropping anything at its default.
 *
 * `undefined` removes a key from the URL entirely — an unfiltered table should have a
 * clean address bar, not a trail of `stage=&priority=`.
 */
export function toQueryParams(query: JobQuery): Params {
  return {
    page: query.page > 1 ? query.page : undefined,
    ordering: query.ordering === DEFAULT_JOB_QUERY.ordering ? undefined : query.ordering,
    q: query.search.trim() || undefined,
    stage: query.stage.length ? query.stage : undefined,
    priority: query.priority.length ? query.priority : undefined,
    tech: query.assigned_tech ?? undefined,
    hold: query.on_hold ?? undefined,
    overdue: query.overdue ?? undefined,
    rework: query.has_rework ?? undefined,
  };
}

/** Count of active filters, for the "clear filters" affordance. */
export function activeFilterCount(query: JobQuery): number {
  return (
    query.stage.length +
    query.priority.length +
    (query.search.trim() ? 1 : 0) +
    (query.assigned_tech !== null ? 1 : 0) +
    (query.on_hold !== null ? 1 : 0) +
    (query.overdue !== null ? 1 : 0) +
    (query.has_rework !== null ? 1 : 0)
  );
}

/** Toggle a value in a multi-select filter and reset to page 1. */
export function toggleIn<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

/** Clicking a column header cycles ascending → descending on that field. */
export function nextOrdering(current: string, field: string): string {
  return current === field ? `-${field}` : field;
}

export function orderingDirection(current: string, field: string): 'asc' | 'desc' | null {
  if (current === field) return 'asc';
  if (current === `-${field}`) return 'desc';
  return null;
}
