import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { userMessageFrom } from '../../../core/api/api-error';
import { JobsApi } from '../../../core/api/jobs.api';
import { AuthService } from '../../../core/auth/auth.service';
import { JobQuery, JobRow, Paginated, Priority, User } from '../../../core/domain/api.model';
import { STAGES, STAGE_LABEL, Stage } from '../../../core/domain/job.model';
import {
  activeFilterCount,
  nextOrdering,
  orderingDirection,
  parseJobQuery,
  toQueryParams,
  toggleIn,
} from '../job-query';

/** Mirrors JobPagination.page_size on the server. */
const PAGE_SIZE = 50;

type ListState =
  | { status: 'loading' }
  | { status: 'ok'; data: Paginated<JobRow> }
  | { status: 'error'; message: string };

const LOADING: ListState = { status: 'loading' };

@Component({
  selector: 'app-job-list',
  imports: [RouterLink, ReactiveFormsModule, ScrollingModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './job-list.html',
  styleUrl: './job-list.scss',
})
export class JobList {
  private readonly api = inject(JobsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly stages = STAGES;
  protected readonly stageLabel = STAGE_LABEL;
  protected readonly priorities: readonly Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  protected readonly isFieldTech = computed(() => this.auth.role() === 'FIELD_TECH');

  /** URL → state. Every render below is a function of this signal. */
  protected readonly query = toSignal(
    this.route.queryParams.pipe(map(parseJobQuery)),
    { initialValue: parseJobQuery(this.route.snapshot.queryParams) },
  );

  protected readonly activeFilters = computed(() => activeFilterCount(this.query()));

  /** The state most recently asked for, which may still be in flight to the router. */
  private readonly requested = signal<JobQuery | null>(null);

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((query) =>
        this.api.list(query).pipe(
          map((data): ListState => ({ status: 'ok', data })),
          catchError((error: unknown) =>
            of<ListState>({ status: 'error', message: userMessageFrom(error) }),
          ),
          startWith<ListState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: LOADING },
  );

  /**
   * The last successful page, kept so the table does not flash "0 jobs matching" on
   * every filter change while the next request is in flight.
   */
  private readonly lastLoaded = signal<Paginated<JobRow> | null>(null);

  protected readonly rows = computed(() => {
    const state = this.state();
    if (state.status === 'ok') return state.data.results;
    return state.status === 'loading' ? (this.lastLoaded()?.results ?? []) : [];
  });

  protected readonly total = computed(() => {
    const state = this.state();
    if (state.status === 'ok') return state.data.count;
    return state.status === 'loading' ? (this.lastLoaded()?.count ?? 0) : 0;
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  /** Field Techs only ever see their own jobs, so the tech filter is noise for them. */
  protected readonly techs = toSignal(
    this.isFieldTech() ? of<User[]>([]) : this.api.users('FIELD_TECH').pipe(catchError(() => of<User[]>([]))),
    { initialValue: [] as User[] },
  );

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly debouncedSearch = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: null },
  );

  constructor() {
    // Once the router echoes a change back, the pending intent has landed.
    effect(() => {
      this.query();
      this.requested.set(null);
    });

    // Remember the last good page so loading keeps showing it rather than zero.
    effect(() => {
      const state = this.state();
      if (state.status === 'ok') this.lastLoaded.set(state.data);
    });

    // Seed the box from the URL on first load / back navigation, without echoing back.
    effect(() => {
      const fromUrl = this.query().search;
      if (fromUrl !== this.searchControl.value) {
        this.searchControl.setValue(fromUrl, { emitEvent: false });
      }
    });

    effect(() => {
      const typed = this.debouncedSearch();
      if (typed === null) return;
      // replaceUrl: typing should not bury the previous page under 12 history entries.
      this.patch({ search: typed, page: 1 }, true);
    });
  }

  /**
   * Merge a change into the table's state and push it to the URL.
   *
   * Merging against `requested` rather than `query` matters: `query` only updates once
   * the router has echoed the new parameters back, so two quick clicks would both build
   * on the pre-first-click state and the router would drop the earlier navigation.
   */
  protected patch(partial: Partial<JobQuery>, replaceUrl = false): void {
    // `untracked` because patch() is a command, not a derivation. The debounced-search
    // effect calls it, and without this the effect would take a dependency on the very
    // signals patch() updates and re-run itself.
    const base = untracked(() => this.requested() ?? this.query());
    const next: JobQuery = { ...base, ...partial };
    this.requested.set(next);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toQueryParams(next),
      replaceUrl,
    });
  }

  protected toggleStage(stage: Stage): void {
    this.patch({ stage: toggleIn(this.query().stage, stage), page: 1 });
  }

  protected togglePriority(priority: Priority): void {
    this.patch({ priority: toggleIn(this.query().priority, priority), page: 1 });
  }

  protected toggleFlag(key: 'on_hold' | 'overdue' | 'has_rework'): void {
    // Cycle: off → on → excluded → off. Three states, because "not overdue" is a real filter.
    const current = this.query()[key];
    const next = current === null ? true : current === true ? false : null;
    this.patch({ [key]: next, page: 1 } as Partial<JobQuery>);
  }

  protected sortBy(field: string): void {
    this.patch({ ordering: nextOrdering(this.query().ordering, field), page: 1 });
  }

  protected direction(field: string): 'asc' | 'desc' | null {
    return orderingDirection(this.query().ordering, field);
  }

  protected goToPage(page: number): void {
    this.patch({ page: Math.min(Math.max(1, page), this.pageCount()) });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected trackRow(_index: number, row: JobRow): number {
    return row.id;
  }

  protected onTechChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.patch({ assigned_tech: value ? Number(value) : null, page: 1 });
  }

  /** Accessible name for a sort control, carrying the current state. */
  protected sortLabel(field: string, label: string): string {
    const direction = this.direction(field);
    if (direction === 'asc') return `Sort by ${label}, currently ascending`;
    if (direction === 'desc') return `Sort by ${label}, currently descending`;
    return `Sort by ${label}`;
  }
}
