import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const API = 'http://localhost:8000';
const LOGIN_URL = `${API}/api/auth/token/`;
const REFRESH_URL = `${API}/api/auth/token/refresh/`;
const RESOURCE = `${API}/api/jobs/`;

const USER = {
  id: 1,
  username: 'coordinator',
  email: 'c@example.com',
  first_name: 'Priya',
  last_name: 'Raman',
  full_name: 'Priya Raman',
  role: 'COORDINATOR' as const,
  phone: '',
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        // A real /login route: the interceptor redirects there when a refresh fails,
        // and an empty route table turns that into an unhandled NG04002.
        provideRouter([{ path: 'login', children: [] }]),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function signIn(access = 'access-1'): void {
    auth.login('coordinator', 'pw').subscribe();
    httpMock
      .expectOne(LOGIN_URL)
      .flush({ access, refresh: 'refresh-1', user: USER });
  }

  it('sends no Authorization header before sign-in', () => {
    http.get(RESOURCE).subscribe();

    const request = httpMock.expectOne(RESOURCE);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('attaches the access token once signed in', () => {
    signIn('access-1');

    http.get(RESOURCE).subscribe();

    const request = httpMock.expectOne(RESOURCE);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush({});
  });

  it('leaves the login request itself unauthenticated', () => {
    // Without SKIP_AUTH, a 401 from login would trigger a refresh and recurse.
    auth.login('coordinator', 'pw').subscribe({ error: () => undefined });

    const request = httpMock.expectOne(LOGIN_URL);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ detail: 'No active account found' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('refreshes once on a 401 and replays the original request with the new token', () => {
    signIn('stale-token');

    let body: unknown = null;
    http.get(RESOURCE).subscribe((response) => (body = response));

    const first = httpMock.expectOne(RESOURCE);
    expect(first.request.headers.get('Authorization')).toBe('Bearer stale-token');
    first.flush({ detail: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = httpMock.expectOne(REFRESH_URL);
    expect(refresh.request.body).toEqual({ refresh: 'refresh-1' });
    refresh.flush({ access: 'fresh-token' });

    const replay = httpMock.expectOne(RESOURCE);
    expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    replay.flush({ count: 0, results: [] });

    expect(body).toEqual({ count: 0, results: [] });
  });

  it('issues a single refresh for a burst of parallel 401s', () => {
    // Otherwise a screen firing several requests would rotate the refresh token
    // several times and invalidate its own session.
    signIn('stale-token');

    http.get(`${RESOURCE}?a=1`).subscribe({ error: () => undefined });
    http.get(`${RESOURCE}?b=2`).subscribe({ error: () => undefined });
    http.get(`${RESOURCE}?c=3`).subscribe({ error: () => undefined });

    for (const suffix of ['?a=1', '?b=2', '?c=3']) {
      httpMock
        .expectOne(`${RESOURCE}${suffix}`)
        .flush({}, { status: 401, statusText: 'Unauthorized' });
    }

    const refreshes = httpMock.match(REFRESH_URL);
    expect(refreshes.length).toBe(1);
    refreshes[0].flush({ access: 'fresh-token' });

    for (const suffix of ['?a=1', '?b=2', '?c=3']) {
      const replay = httpMock.expectOne(`${RESOURCE}${suffix}`);
      expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh-token');
      replay.flush({});
    }
  });

  it('signs the user out when the refresh itself is rejected', () => {
    signIn('stale-token');
    expect(auth.isAuthenticated()).toBe(true);

    http.get(RESOURCE).subscribe({ error: () => undefined });
    httpMock.expectOne(RESOURCE).flush({}, { status: 401, statusText: 'Unauthorized' });

    httpMock
      .expectOne(REFRESH_URL)
      .flush({ detail: 'Token is invalid' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('installops.refresh')).toBeNull();
  });

  it('does not attempt a refresh when there is no refresh token to use', () => {
    http.get(RESOURCE).subscribe({ error: () => undefined });
    httpMock.expectOne(RESOURCE).flush({}, { status: 401, statusText: 'Unauthorized' });

    httpMock.expectNone(REFRESH_URL);
  });

  it('passes non-401 failures straight through without refreshing', () => {
    signIn();

    let status = 0;
    http.get(RESOURCE).subscribe({ error: (error) => (status = error.status) });
    httpMock.expectOne(RESOURCE).flush({}, { status: 403, statusText: 'Forbidden' });

    httpMock.expectNone(REFRESH_URL);
    expect(status).toBe(403);
  });
});
