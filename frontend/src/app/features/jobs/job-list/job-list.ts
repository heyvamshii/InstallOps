import { ScrollingModule } from '@angular/cdk/scrolling';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
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

  protected readonly rows = computed(() => {
    const state = this.state();
    return state.status === 'ok' ? state.data.results : [];
  });

  protected readonly total = computed(() => {
    const state = this.state();
    return state.status === 'ok' ? state.data.count : 0;
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

  protected patch(partial: Partial<JobQuery>, replaceUrl = false): void {
    const next: JobQuery = { ...this.query(), ...partial };
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
}
