import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
} from '@angular/core';

import { AuthService } from '../core/auth/auth.service';
import { Role } from '../core/domain/job.model';

/**
 * Renders content only for the given roles:
 *
 *     <button *appIfRole="['COORDINATOR', 'ADMIN']">New job</button>
 *
 * Presentation only. The server rejects the request regardless of what rendered, so this
 * removes noise from the UI — it is not what keeps anyone out.
 */
@Directive({ selector: '[appIfRole]' })
export class IfRoleDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  readonly appIfRole = input.required<readonly Role[]>();

  private rendered = false;

  constructor() {
    effect(() => {
      const allowed = this.auth.hasAnyRole(this.appIfRole());

      if (allowed && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
