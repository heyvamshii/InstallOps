import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth/auth.service';
import { ROLE_LABEL, Role } from '../core/domain/job.model';

interface NavItem {
  path: string;
  label: string;
  hint: string;
  roles: readonly Role[];
}

const NAV: readonly NavItem[] = [
  {
    path: '/dashboard',
    label: 'Overview',
    hint: 'What is stuck, overdue, and being reworked',
    roles: ['COORDINATOR', 'ADMIN'],
  },
  {
    path: '/jobs',
    label: 'Jobs',
    hint: 'The full queue',
    roles: ['COORDINATOR', 'DESIGNER', 'ADMIN'],
  },
  {
    path: '/jobs',
    label: 'My work',
    hint: 'Jobs assigned to you',
    roles: ['FIELD_TECH'],
  },
  {
    path: '/admin/users',
    label: 'People',
    hint: 'Roles and assignments',
    roles: ['ADMIN'],
  },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <nav class="rail" aria-label="Main navigation">
        <a class="rail__brand" routerLink="/">
          <span class="rail__mark" aria-hidden="true"></span>
          <span class="rail__word">InstallOps</span>
        </a>

        <ul class="rail__nav">
          @for (item of visibleNav(); track item.label) {
            <li>
              <a
                class="rail__link"
                [routerLink]="item.path"
                routerLinkActive="rail__link--active"
                [routerLinkActiveOptions]="{ exact: item.path === '/jobs' }"
              >
                <span class="rail__link-label">{{ item.label }}</span>
                <span class="rail__link-hint">{{ item.hint }}</span>
              </a>
            </li>
          }
        </ul>

        <div class="rail__foot">
          <div class="who">
            <span class="who__name">{{ user()?.full_name }}</span>
            <span class="who__role">{{ roleLabel() }}</span>
          </div>
          <button type="button" class="btn btn--ghost btn--sm rail__signout" (click)="signOut()">
            Sign out
          </button>
        </div>
      </nav>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    .shell {
      display: grid;
      grid-template-columns: var(--rail-width) minmax(0, 1fr);
      min-height: 100dvh;
    }

    .rail {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-4) var(--space-3);
      background: var(--surface-inverse);
      color: var(--ink-inverse);
      position: sticky;
      top: 0;
      height: 100dvh;
    }

    .rail__brand {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2);
      font-weight: 650;
      letter-spacing: var(--tracking-tight);
    }

    .rail__mark {
      width: 0.65rem;
      height: 1.15rem;
      border-radius: 2px;
      background: var(--accent);
      transform: skewX(-12deg);
    }

    .rail__nav {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
      flex: 1;
    }

    .rail__link {
      display: grid;
      gap: 1px;
      padding: 0.5rem 0.6rem;
      border-radius: var(--radius);
      border-left: 2px solid transparent;
      transition:
        background-color var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out);

      &:hover {
        background: oklch(100% 0 0 / 0.06);
      }
    }

    .rail__link--active {
      background: oklch(100% 0 0 / 0.08);
      border-left-color: var(--accent);
    }

    .rail__link-label {
      font-size: var(--text-sm);
      font-weight: 600;
    }

    .rail__link-hint {
      font-size: var(--text-2xs);
      color: oklch(72% 0.01 80);
      line-height: 1.3;
    }

    .rail__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding-top: var(--space-3);
      border-top: 1px solid oklch(100% 0 0 / 0.12);
    }

    .who {
      display: grid;
      min-width: 0;
    }

    .who__name {
      font-size: var(--text-sm);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .who__role {
      font-size: var(--text-2xs);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
      color: var(--accent);
    }

    .rail__signout {
      --btn-ink: oklch(80% 0.01 80);
      flex-shrink: 0;

      &:hover {
        --btn-bg: oklch(100% 0 0 / 0.1);
        --btn-ink: var(--ink-inverse);
      }
    }

    .content {
      min-width: 0;
    }

    @media (max-width: 60rem) {
      .shell {
        grid-template-columns: 1fr;
      }

      .rail {
        position: static;
        height: auto;
        flex-direction: row;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-3);
      }

      .rail__nav {
        display: flex;
        flex: 1 1 100%;
        overflow-x: auto;
      }

      .rail__link-hint {
        display: none;
      }
    }
  `,
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABEL[role] : '';
  });

  protected readonly visibleNav = computed(() => {
    const role = this.auth.role();
    return role ? NAV.filter((item) => item.roles.includes(role)) : [];
  });

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
