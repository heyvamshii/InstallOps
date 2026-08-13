import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { userMessageFrom } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { homeFor } from '../../core/auth/role-home';

interface DemoAccount {
  username: string;
  label: string;
  blurb: string;
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { username: 'coordinator', label: 'Coordinator', blurb: 'Intake, permitting, QA, close-out' },
  { username: 'designer', label: 'Designer', blurb: 'Design packages and approvals' },
  { username: 'tech', label: 'Field Tech', blurb: 'Only the jobs assigned to them' },
  { username: 'admin', label: 'Admin', blurb: 'Everything, plus force-transitions' },
];

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="login">
      <section class="login__pitch">
        <p class="eyebrow">InstallOps</p>
        <h1>
          Six stages.<br />
          Four roles.<br />
          <span class="login__accent">No job moves by accident.</span>
        </h1>
        <p class="login__lede">
          A field installation tracker where the stage is a state machine, not a dropdown.
          Illegal moves are impossible, failed inspections carry a reason, and every
          transition is on the record.
        </p>

        <ol class="pipeline" aria-label="Job lifecycle">
          @for (stage of stages; track stage) {
            <li class="pipeline__step stage-{{ stage }}">{{ stage }}</li>
          }
        </ol>
      </section>

      <section class="login__form-side">
        <form class="login__card panel" [formGroup]="form" (ngSubmit)="submit()">
          <h2>Sign in</h2>

          <div class="field">
            <label class="field__label" for="username">Username</label>
            <input
              id="username"
              class="input"
              formControlName="username"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>

          <div class="field">
            <label class="field__label" for="password">Password</label>
            <input
              id="password"
              class="input"
              type="password"
              formControlName="password"
              autocomplete="current-password"
            />
          </div>

          @if (error()) {
            <p class="login__error" role="alert">{{ error() }}</p>
          }

          <button class="btn btn--primary login__submit" type="submit" [disabled]="busy()">
            {{ busy() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <div class="demo">
          <p class="eyebrow">Demo accounts — one click to fill</p>
          <ul class="demo__list">
            @for (account of demoAccounts; track account.username) {
              <li>
                <button type="button" class="demo__btn" (click)="useDemo(account.username)">
                  <span class="demo__role">{{ account.label }}</span>
                  <span class="demo__blurb">{{ account.blurb }}</span>
                </button>
              </li>
            }
          </ul>
        </div>
      </section>
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }

    .login {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      min-height: 100dvh;
    }

    .login__pitch {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--space-5);
      padding: var(--space-8) var(--space-7);
      background: var(--surface-inverse);
      color: var(--ink-inverse);
      /* A faint grid, so the panel reads as drafting paper rather than a colour block. */
      background-image:
        linear-gradient(var(--ink-inverse) 1px, transparent 1px),
        linear-gradient(90deg, var(--ink-inverse) 1px, transparent 1px);
      background-size: 88px 88px;
      background-blend-mode: overlay;
    }

    .login__pitch h1 {
      font-size: var(--text-display);
      line-height: 1.02;
    }

    .login__accent {
      color: var(--accent);
    }

    .login__lede {
      max-width: 42ch;
      color: oklch(80% 0.01 80);
      font-size: var(--text-lg);
    }

    .pipeline {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      margin: var(--space-4) 0 0;
      padding: 0;
      list-style: none;
    }

    .pipeline__step {
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      border: 1px solid color-mix(in oklch, var(--chip-ink) 55%, transparent);
      color: var(--chip-ink);
      font-size: var(--text-2xs);
      font-weight: 650;
      letter-spacing: 0.05em;
    }

    .login__form-side {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--space-5);
      padding: var(--space-7) var(--space-6);
      background: var(--ground);
    }

    .login__card {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 24rem;
      width: 100%;
      padding: var(--space-5);
      box-shadow: var(--shadow);
    }

    .login__submit {
      margin-top: var(--space-1);
      justify-content: center;
      padding-block: 0.6rem;
    }

    .login__error {
      padding: var(--space-2) var(--space-3);
      border-left: 3px solid var(--danger);
      background: var(--danger-soft);
      color: var(--danger);
      font-size: var(--text-sm);
    }

    .demo {
      max-width: 24rem;
      width: 100%;
    }

    .demo__list {
      display: grid;
      gap: var(--space-1);
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
    }

    .demo__btn {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-3);
      width: 100%;
      padding: 0.45rem 0.6rem;
      border: 1px solid transparent;
      border-radius: var(--radius);
      background: transparent;
      text-align: left;
      cursor: pointer;
      transition:
        background-color var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out);

      &:hover {
        background: var(--surface);
        border-color: var(--rule);
      }
    }

    .demo__role {
      font-size: var(--text-sm);
      font-weight: 600;
    }

    .demo__blurb {
      color: var(--ink-faint);
      font-size: var(--text-xs);
      text-align: right;
    }

    @media (max-width: 60rem) {
      .login {
        grid-template-columns: 1fr;
      }

      .login__pitch {
        padding: var(--space-6) var(--space-4);
      }

      .login__form-side {
        align-items: center;
        padding: var(--space-5) var(--space-4);
      }
    }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly stages = ['INTAKE', 'DESIGN', 'PERMITTING', 'INSTALLATION', 'QA', 'COMPLETE'];
  protected readonly demoAccounts = DEMO_ACCOUNTS;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected useDemo(username: string): void {
    this.form.setValue({ username, password: 'InstallOps!2026' });
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    const { username, password } = this.form.getRawValue();

    this.auth.login(username, password).subscribe({
      next: (user) => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl || homeFor(user.role));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(userMessageFrom(err, 'Those credentials were not accepted.'));
      },
    });
  }
}
