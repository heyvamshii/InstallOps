import { DEFAULT_JOB_QUERY, JobQuery } from '../../core/domain/api.model';
import {
  activeFilterCount,
  nextOrdering,
  orderingDirection,
  parseJobQuery,
  toQueryParams,
  toggleIn,
} from './job-query';

function queryWith(overrides: Partial<JobQuery> = {}): JobQuery {
  return { ...DEFAULT_JOB_QUERY, ...overrides };
}

describe('parseJobQuery', () => {
  it('returns defaults for an empty URL', () => {
    expect(parseJobQuery({})).toEqual(DEFAULT_JOB_QUERY);
  });

  it('reads every supported parameter', () => {
    const parsed = parseJobQuery({
      page: '3',
      ordering: 'job_number',
      q: 'tumbleweed',
      stage: ['DESIGN', 'QA'],
      priority: 'URGENT',
      tech: '7',
      hold: 'true',
      overdue: 'false',
      rework: 'true',
    });

    expect(parsed).toEqual({
      page: 3,
      ordering: 'job_number',
      search: 'tumbleweed',
      stage: ['DESIGN', 'QA'],
      priority: ['URGENT'],
      assigned_tech: 7,
      on_hold: true,
      overdue: false,
      has_rework: true,
    });
  });

  it('accepts a single stage as a bare string, not only an array', () => {
    expect(parseJobQuery({ stage: 'INTAKE' }).stage).toEqual(['INTAKE']);
  });

  it('discards stage and priority values that are not in the enum', () => {
    const parsed = parseJobQuery({
      stage: ['DESIGN', 'NOT_A_STAGE', 'DROP TABLE jobs'],
      priority: ['URGENT', 'WHENEVER'],
    });

    expect(parsed.stage).toEqual(['DESIGN']);
    expect(parsed.priority).toEqual(['URGENT']);
  });

  it('falls back to page 1 for junk, zero, and negative pages', () => {
    expect(parseJobQuery({ page: 'abc' }).page).toBe(1);
    expect(parseJobQuery({ page: '0' }).page).toBe(1);
    expect(parseJobQuery({ page: '-4' }).page).toBe(1);
  });

  it('treats anything other than "true"/"false" as an unset tri-state', () => {
    expect(parseJobQuery({ hold: 'yes' }).on_hold).toBeNull();
    expect(parseJobQuery({ hold: '1' }).on_hold).toBeNull();
    expect(parseJobQuery({}).on_hold).toBeNull();
  });

  it('ignores a non-numeric tech id', () => {
    expect(parseJobQuery({ tech: 'me' }).assigned_tech).toBeNull();
  });
});

describe('toQueryParams', () => {
  it('emits nothing for a default query, so an unfiltered table has a clean URL', () => {
    const params = toQueryParams(DEFAULT_JOB_QUERY);
    expect(Object.values(params).every((value) => value === undefined)).toBe(true);
  });

  it('omits page 1 but keeps later pages', () => {
    expect(toQueryParams(queryWith({ page: 1 }))['page']).toBeUndefined();
    expect(toQueryParams(queryWith({ page: 4 }))['page']).toBe(4);
  });

  it('drops a whitespace-only search', () => {
    expect(toQueryParams(queryWith({ search: '   ' }))['q']).toBeUndefined();
  });

  it('keeps `false` tri-states, which are a real filter and not an absence', () => {
    const params = toQueryParams(queryWith({ on_hold: false, overdue: false }));
    expect(params['hold']).toBe(false);
    expect(params['overdue']).toBe(false);
  });
});

describe('URL round trip', () => {
  it('survives parse → serialise → parse unchanged', () => {
    const original = queryWith({
      page: 2,
      ordering: 'target_completion_date',
      search: 'austin',
      stage: ['PERMITTING', 'QA'],
      priority: ['HIGH'],
      assigned_tech: 12,
      on_hold: false,
      overdue: true,
      has_rework: null,
    });

    const params = toQueryParams(original);
    // Query params arrive from the router as strings.
    const asStrings = Object.fromEntries(
      Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, Array.isArray(value) ? value : String(value)]),
    );

    expect(parseJobQuery(asStrings)).toEqual(original);
  });
});

describe('activeFilterCount', () => {
  it('is zero for an unfiltered query regardless of page or ordering', () => {
    expect(activeFilterCount(queryWith({ page: 9, ordering: 'stage' }))).toBe(0);
  });

  it('counts each stage and priority separately', () => {
    expect(activeFilterCount(queryWith({ stage: ['INTAKE', 'QA'], priority: ['LOW'] }))).toBe(3);
  });

  it('counts a false tri-state as active', () => {
    expect(activeFilterCount(queryWith({ overdue: false }))).toBe(1);
  });
});

describe('toggleIn', () => {
  it('adds a value that is absent and removes one that is present', () => {
    expect(toggleIn(['A'], 'B')).toEqual(['A', 'B']);
    expect(toggleIn(['A', 'B'], 'A')).toEqual(['B']);
  });

  it('does not mutate the input', () => {
    const original = ['A'];
    toggleIn(original, 'B');
    expect(original).toEqual(['A']);
  });
});

describe('ordering', () => {
  it('cycles ascending then descending on the same field', () => {
    expect(nextOrdering('-created_at', 'stage')).toBe('stage');
    expect(nextOrdering('stage', 'stage')).toBe('-stage');
  });

  it('reports direction only for the active field', () => {
    expect(orderingDirection('stage', 'stage')).toBe('asc');
    expect(orderingDirection('-stage', 'stage')).toBe('desc');
    expect(orderingDirection('-stage', 'job_number')).toBeNull();
  });
});
