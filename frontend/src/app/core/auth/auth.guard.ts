import { inject } from '@angular/core';
import { CanMatchFn, Route, Router, UrlSegment } from '@angular/router';

import { Role } from '../domain/job.model';
import { AuthService } from './auth.service';

function pathOf(segments: UrlSegment[]): string {
  return '/' + segments.map((segment) => segment.path).join('/');
}

/**
 * `CanMatch` rather than `CanActivate` on purpose: a route that fails to match never
 * loads its lazy chunk, so an unauthorised user does not download the feature's code and
 * there is no flash of a screen they cannot use.
 */
export const authGuard: CanMatchFn = (_route: Route, segments: UrlSegment[]) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: pathOf(segments) },
  });
};

/** Restrict a route to specific roles. Sends an authenticated-but-wrong-role user home. */
export function roleGuard(...roles: Role[]): CanMatchFn {
  return (_route: Route, segments: UrlSegment[]) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: pathOf(segments) },
      });
    }
    return auth.hasAnyRole(roles) ? true : router.createUrlTree(['/jobs']);
  };
}

/** Keeps a signed-in user off the login screen. */
export const guestGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/jobs']) : true;
};
