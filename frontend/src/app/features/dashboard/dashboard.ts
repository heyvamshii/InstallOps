import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { JobsApi } from '../../core/api/jobs.api';
import { JobRow } from '../../core/domain/api.model';
import { STAGES, STAGE_LABEL, Stage } from '../../core/domain/job.model';

interface StageCount {
  stage: Stage;
  count: number;
}

interface Snapshot {
  stages: StageCount[];
  overdue: number;
  rework: number;
  held: number;
  recent: JobRow[];
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div>
        <p class="eyebrow">Operations</p>
        <h1>Where the work is stuck</h1>
      </div>
      @if (roundTrips() > 0) {
        <p class="head__probe tabular" title="Baseline for the GraphQL comparison">
          {{ roundTrips() }} REST round trips
        </p>
      }
    </header>

    @if (error()) {
      <div class="state state--error" role="alert">{{ error() }}</div>
    } @else if (data(); as snapshot) {
      <section class="rail" aria-label="Jobs by stage">
        @for (entry of snapshot.stages; track entry.stage) {
          <a
            class="rail__card stage-{{ entry.stage }}"
            [routerLink]="['/jobs']"
            [queryParams]="{ stage: entry.stage }"
          >
            <span class="rail__label">{{ stageLabel[entry.stage] }}</span>
            <span class="rail__value tabular">{{ entry.count }}</span>
            <span class="rail__bar" [style.--fill.%]="percentOf(entry.count)"></span>
          </a>
        }
      </section>

      <section class="alerts" aria-label="Attention needed">
        <a class="alert" [routerLink]="['/jobs']" [queryParams]="{ overdue: true }">
          <span class="alert__value tabular">{{ snapshot.overdue }}</span>
          <span class="alert__label">past their target date</span>
        </a>
        <a class="alert" [routerLink]="['/jobs']" [queryParams]="{ hold: true }">
          <span class="alert__value tabular">{{ snapshot.held }}</span>
          <span class="alert__label">on hold</span>
        </a>
        <a class="alert" [routerLink]="['/jobs']" [queryParams]="{ rework: true }">
          <span class="alert__value tabular">{{ snapshot.rework }}</span>
          <span class="alert__label">sent back from QA at least once</span>
        </a>
      </section>

      <section class="recent panel" aria-label="Recent activity">
        <h2>Latest movement</h2>
        <ul class="recent__list">
          @for (job of snapshot.recent; track job.id) {
            <li>
              <a class="recent__row" [routerLink]="['/jobs', job.id]">
                <span class="tabular recent__id">{{ job.job_number }}</span>
                <span class="recent__customer">{{ job.customer_name }}</span>
                <span class="stage-chip stage-{{ job.stage }}">{{ stageLabel[job.stage] }}</span>
                <span class="recent__site">{{ job.site_city }}, {{ job.site_state }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    } @else {
      <p class="state">Loading…</p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-5) var(--space-5) var(--space-7);
      max-width: 84rem;
    }

    .head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4);
      padding-bottom: var(--space-5);
      border-bottom: 1px solid var(--rule);
    }

    .head h1 {
      font-size: var(--text-2xl);
    }

    .head__probe {
      color: var(--ink-faint);
      font-size: var(--text-xs);
    }

    .rail {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: var(--space-2);
      margin: var(--space-5) 0;
    }

    .rail__card {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-3);
      border: 1px solid var(--rule);
      border-top: 3px solid var(--chip-ink);
      border-radius: var(--radius);
      background: var(--surface);
      transition:
        transform var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);

      &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow);
      }
    }

    .rail__label {
      font-size: var(--text-2xs);
      font-weight: 650;
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
      color: var(--ink-muted);
    }

    .rail__value {
      font-size: var(--text-2xl);
      font-weight: 600;
      line-height: 1;
      color: var(--chip-ink);
    }

    .rail__bar {
      height: 3px;
      border-radius: 999px;
      background: var(--surface-sunken);
      overflow: hidden;

      &::after {
        content: '';
        display: block;
        height: 100%;
        width: calc(var(--fill) * 1%);
        background: var(--chip-ink);
      }
    }

    .alerts {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3);
      margin-bottom: var(--space-5);
    }

    .alert {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--rule);
      border-radius: var(--radius-lg);
      background: var(--surface);

      &:hover {
        border-color: var(--accent);
      }
    }

    .alert__value {
      font-size: var(--text-display);
      font-weight: 600;
      line-height: 0.9;
      color: var(--accent);
    }

    .alert__label {
      color: var(--ink-muted);
      font-size: var(--text-sm);
    }

    .recent {
      padding: var(--space-4);
    }

    .recent h2 {
      margin-bottom: var(--space-3);
      font-size: var(--text-lg);
    }

    .recent__list {
      display: grid;
      gap: 1px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .recent__row {
      display: grid;
      grid-template-columns: 9rem 1fr 8rem 1fr;
      gap: var(--space-3);
      align-items: center;
      padding: 0.4rem 0.5rem;
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);

      &:hover {
        background: var(--surface-sunken);
      }
    }

    .recent__id {
      font-weight: 600;
    }

    .recent__site {
      color: var(--ink-faint);
    }

    .state {
      padding: var(--space-6);
      color: var(--ink-muted);
    }

    .state--error {
      color: var(--danger);
    }

    @media (max-width: 70rem) {
      .rail {
        grid-template-columns: repeat(3, 1fr);
      }

      .alerts {
        grid-template-columns: 1fr;
      }

      .recent__row {
        grid-template-columns: 8rem 1fr;
      }

      .recent__site,
      .recent__row .stage-chip {
        display: none;
      }
    }
  `,
})
export class Dashboard {
  private readonly api = inject(JobsApi);

  protected readonly stageLabel = STAGE_LABEL;
  protected readonly data = signal<Snapshot | null>(null);
  protected readonly error = signal('');
  protected readonly roundTrips = signal(0);

  protected readonly busiestStage = computed(() =>
    Math.max(1, ...(this.data()?.stages ?? []).map((entry) => entry.count)),
  );

  constructor() {
    this.load();
  }

  /**
   * Deliberately composed from separate REST calls — one per figure.
   *
   * This is the baseline the planned single GraphQL query has to beat. The round-trip
   * count is rendered in the header so the comparison is measured, not asserted.
   */
  private load(): void {
    const stageProbes = STAGES.map((stage) =>
      this.api.count({ page: 1, stage: [stage] }).pipe(map((page) => ({ stage, count: page.count }))),
    );

    const requests = {
      stages: forkJoin(stageProbes),
      overdue: this.api.count({ page: 1, overdue: true }).pipe(map((page) => page.count)),
      held: this.api.count({ page: 1, on_hold: true }).pipe(map((page) => page.count)),
      rework: this.api.count({ page: 1, has_rework: true }).pipe(map((page) => page.count)),
      recent: this.api
        .list({
          page: 1,
          ordering: '-updated_at',
          search: '',
          stage: [],
          priority: [],
          assigned_tech: null,
          on_hold: null,
          overdue: null,
          has_rework: null,
        })
        .pipe(map((page) => page.results.slice(0, 8))),
    };

    this.roundTrips.set(stageProbes.length + 4);

    forkJoin(requests)
      .pipe(catchError(() => of(null)))
      .subscribe((snapshot) => {
        if (!snapshot) {
          this.error.set('The dashboard could not load. Try again shortly.');
          return;
        }
        this.data.set(snapshot);
      });
  }

  protected percentOf(count: number): number {
    return Math.round((count / this.busiestStage()) * 100);
  }
}
