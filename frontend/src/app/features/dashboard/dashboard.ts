import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Apollo } from 'apollo-angular';

import { Overview, OVERVIEW_QUERY, OverviewQueryResult } from '../../core/api/overview.graphql';
import { STAGE_LABEL } from '../../core/domain/job.model';

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
      @if (data(); as snapshot) {
        <p class="head__total">
          <span class="tabular head__total-value">{{ snapshot.total }}</span>
          <span class="head__total-label">jobs tracked</span>
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
            <span class="rail__label">{{ entry.label }}</span>
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
                <span class="tabular recent__id">{{ job.jobNumber }}</span>
                <span class="recent__customer">{{ job.customerName }}</span>
                <span class="stage-chip stage-{{ job.stage }}">{{ stageLabel[job.stage] }}</span>
                <span class="recent__site">
                  {{ job.siteCity }}, {{ job.siteState }}
                  @if (job.onHold) {
                    <span class="recent__hold">held</span>
                  }
                </span>
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

    .head__total {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
    }

    .head__total-value {
      font-size: var(--text-2xl);
      font-weight: 600;
      color: var(--accent);
    }

    .head__total-label {
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

    .recent__hold {
      margin-left: 0.3rem;
      padding: 0 0.25rem;
      border-radius: var(--radius-sm);
      background: var(--warning);
      color: oklch(20% 0.03 70);
      font-size: var(--text-2xs);
      font-weight: 700;
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
  private readonly apollo = inject(Apollo);

  protected readonly stageLabel = STAGE_LABEL;
  protected readonly data = signal<Overview | null>(null);
  protected readonly error = signal('');

  private readonly busiestStage = computed(() =>
    Math.max(1, ...(this.data()?.stages ?? []).map((entry) => entry.count)),
  );

  constructor() {
    /**
     * One request for the whole screen.
     *
     * `network-only` because operational counts are the point — a cached overview that
     * says four jobs are overdue when six are is worse than a slower one.
     */
    this.apollo
      .query<OverviewQueryResult>({ query: OVERVIEW_QUERY, fetchPolicy: 'network-only' })
      .subscribe({
        next: (result) => {
          const overview = result.data?.overview;
          if (overview) this.data.set(overview);
          else this.error.set('The overview returned no data.');
        },
        error: () => this.error.set('The overview could not load. Try again shortly.'),
      });
  }

  protected percentOf(count: number): number {
    return Math.round((count / this.busiestStage()) * 100);
  }
}
