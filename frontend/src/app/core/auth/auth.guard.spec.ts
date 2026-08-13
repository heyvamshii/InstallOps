import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlSegment, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';

import { Role } from '../domain/job.model';
import { authGuard, guestGuard, roleGuard } from './auth.guard';
import { AuthService } from './auth.service';

const ROUTE = {} as Route;

/** Angular 22 passes a match snapshot as the third argument; unused by these guards. */
const SNAPSHOT = {} as never;

function segments(...paths: string[]): UrlSegment[] {
  return paths.map((path) => new UrlSegment(path, {}));
}

function run(guard: () => unknown): boolean | UrlTree {
  return TestBed.runInInjectionContext(guard as never) as boolean | UrlTree;
}

describe('route guards', () => {
  let auth: AuthService;
  let router: Router;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function signInAs(role: Role): void {
    // Drive the real service through its login path so the tests exercise the same
    // state the app uses, rather than a hand-set signal.
    auth.login('someone', 'pw').subscribe();
    httpMock.expectOne((request) => request.url.endsWith('/token/')).flush({
      access: 'a',
      refresh: 'r',
      user: {
        id: 1,
        username: 'someone',
        email: '',
        first_name: '',
        last_name: '',
        full_name: 'Someone',
        role,
        phone: '',
      },
    });
  }

  describe('authGuard', () => {
    it('blocks an anonymous visitor and redirects to login', () => {
      const result = run(() => authGuard(ROUTE, segments('jobs', '85'), SNAPSHOT));

      expect(result instanceof UrlTree).toBe(true);
      expect(router.serializeUrl(result as UrlTree)).toBe(
        '/login?returnUrl=%2Fjobs%2F85',
      );
    });

    it('preserves the requested URL so the user lands where they meant to', () => {
      const result = run(() => authGuard(ROUTE, segments('jobs'), SNAPSHOT)) as UrlTree;

      expect(router.serializeUrl(result)).toContain('returnUrl=%2Fjobs');
    });

    it('lets a signed-in user through', () => {
      signInAs('COORDINATOR');

      expect(run(() => authGuard(ROUTE, segments('jobs'), SNAPSHOT))).toBe(true);
    });
  });

  describe('roleGuard', () => {
    it('sends an anonymous visitor to login, not to the fallback route', () => {
      const result = run(() => roleGuard('ADMIN')(ROUTE, segments('admin', 'users'), SNAPSHOT));

      expect(router.serializeUrl(result as UrlTree)).toContain('/login');
    });

    it('admits a role on the list', () => {
      signInAs('ADMIN');

      expect(run(() => roleGuard('COORDINATOR', 'ADMIN')(ROUTE, segments('dashboard'), SNAPSHOT))).toBe(
        true,
      );
    });

    it('redirects a signed-in user whose role is not on the list', () => {
      signInAs('FIELD_TECH');

      const result = run(() => roleGuard('COORDINATOR', 'ADMIN')(ROUTE, segments('dashboard'), SNAPSHOT));

      expect(router.serializeUrl(result as UrlTree)).toBe('/jobs');
    });

    it('keeps a Designer out of the admin area', () => {
      signInAs('DESIGNER');

      const result = run(() => roleGuard('ADMIN')(ROUTE, segments('admin', 'users'), SNAPSHOT));

      expect(router.serializeUrl(result as UrlTree)).toBe('/jobs');
    });
  });

  describe('guestGuard', () => {
    it('allows an anonymous visitor to reach the login screen', () => {
      expect(run(() => guestGuard(ROUTE, segments('login'), SNAPSHOT))).toBe(true);
    });

    it('bounces an already signed-in user away from the login screen', () => {
      signInAs('COORDINATOR');

      const result = run(() => guestGuard(ROUTE, segments('login'), SNAPSHOT));

      expect(router.serializeUrl(result as UrlTree)).toBe('/jobs');
    });
  });
});
