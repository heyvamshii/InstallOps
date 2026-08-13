import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { JobsApi } from '../../core/api/jobs.api';
import { User } from '../../core/domain/api.model';
import { ROLES, ROLE_LABEL, Role } from '../../core/domain/job.model';

@Component({
  selector: 'app-user-directory',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <p class="eyebrow">Admin</p>
      <h1>People</h1>
      <p class="head__note">
        Roles decide which stage a person can advance. Changing one changes what they can do
        immediately — the server checks the role on every request, not just at sign-in.
      </p>
    </header>

    @for (role of roles; track role) {
      <section class="group">
        <h2 class="group__title">
          {{ roleLabel[role] }}
          <span class="tabular group__count">{{ byRole()[role].length }}</span>
        </h2>
        <ul class="people">
          @for (person of byRole()[role]; track person.id) {
            <li class="person">
              <span class="person__name">{{ person.full_name }}</span>
              <span class="tabular person__handle">{{ person.username }}</span>
              <span class="person__email">{{ person.email }}</span>
              @if (role === 'FIELD_TECH') {
                <a
                  class="btn btn--sm"
                  [routerLink]="['/jobs']"
                  [queryParams]="{ tech: person.id }"
                >
                  Their jobs
                </a>
              }
            </li>
          } @empty {
            <li class="person person--empty">Nobody in this role.</li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-5);
      max-width: 62rem;
    }

    .head {
      padding-bottom: var(--space-5);
      border-bottom: 1px solid var(--rule);
    }

    .head h1 {
      font-size: var(--text-2xl);
    }

    .head__note {
      max-width: 62ch;
      margin-top: var(--space-2);
      color: var(--ink-muted);
      font-size: var(--text-sm);
    }

    .group {
      margin-top: var(--space-5);
    }

    .group__title {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
      font-size: var(--text-xs);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
      color: var(--ink-faint);
    }

    .group__count {
      color: var(--accent);
    }

    .people {
      display: grid;
      gap: 1px;
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--rule);
      border-radius: var(--radius);
      background: var(--surface);
      overflow: hidden;
    }

    .person {
      display: grid;
      grid-template-columns: 1fr 8rem 1.2fr auto;
      gap: var(--space-3);
      align-items: center;
      padding: 0.5rem var(--space-3);
      border-bottom: 1px solid var(--rule);
      font-size: var(--text-sm);

      &:last-child {
        border-bottom: 0;
      }
    }

    .person__name {
      font-weight: 550;
    }

    .person__handle,
    .person__email {
      color: var(--ink-faint);
      font-size: var(--text-xs);
    }

    .person--empty {
      display: block;
      color: var(--ink-faint);
      font-style: italic;
    }

    @media (max-width: 48rem) {
      .person {
        grid-template-columns: 1fr auto;
      }

      .person__handle,
      .person__email {
        display: none;
      }
    }
  `,
})
export class UserDirectory {
  private readonly api = inject(JobsApi);

  protected readonly roles = ROLES;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly users = signal<User[]>([]);

  protected readonly byRole = computed(() => {
    const grouped = Object.fromEntries(ROLES.map((role) => [role, [] as User[]])) as Record<
      Role,
      User[]
    >;
    for (const user of this.users()) grouped[user.role]?.push(user);
    return grouped;
  });

  constructor() {
    this.api.users().subscribe({ next: (users) => this.users.set(users) });
  }
}
