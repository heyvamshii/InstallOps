import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoginResponse, User } from '../domain/api.model';
import { Role } from '../domain/job.model';

/**
 * Marks a request the auth interceptor must leave alone — login and refresh, which would
 * otherwise recurse when they themselves return 401.
 */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

export function skipAuth(): HttpContext {
  return new HttpContext().set(SKIP_AUTH, true);
}

const REFRESH_TOKEN_KEY = 'installops.refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/auth`;

  /**
   * Access token lives in memory only, so an XSS payload cannot read it back later from
   * storage. The refresh token is persisted so a page reload does not sign the user out —
   * the real fix is an httpOnly cookie, which needs the backend to own the session.
   */
  private readonly accessToken = signal<string | null>(null);
  private readonly currentUser = signal<User | null>(null);

  private inFlightRefresh: Observable<string> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly token = this.accessToken.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'ADMIN');

  hasAnyRole(roles: readonly Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  login(username: string, password: string): Observable<User> {
    return this.http
      .post<LoginResponse>(
        `${this.base}/token/`,
        { username, password },
        { context: skipAuth() },
      )
      .pipe(
        tap((response) => {
          this.accessToken.set(response.access);
          this.currentUser.set(response.user);
          localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh);
        }),
        map((response) => response.user),
      );
  }

  logout(): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.inFlightRefresh = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Exchange the stored refresh token for a new access token.
   *
   * Shared so that a burst of parallel 401s produces one refresh call, not one per
   * request — otherwise a dashboard firing five requests would rotate the token five
   * times and invalidate itself.
   */
  refresh(): Observable<string> {
    if (this.inFlightRefresh) return this.inFlightRefresh;

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return throwError(() => new Error('No refresh token'));

    this.inFlightRefresh = this.http
      .post<{ access: string; refresh?: string }>(
        `${this.base}/token/refresh/`,
        { refresh: refreshToken },
        { context: skipAuth() },
      )
      .pipe(
        tap((response) => {
          this.accessToken.set(response.access);
          if (response.refresh) {
            localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh);
          }
        }),
        map((response) => response.access),
        tap({
          next: () => (this.inFlightRefresh = null),
          error: () => {
            this.inFlightRefresh = null;
            this.logout();
          },
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.inFlightRefresh;
  }

  /** `/me/` is the authority on role — the token claim is only as fresh as the token. */
  loadCurrentUser(): Observable<User> {
    return this.http
      .get<User>(`${this.base}/me/`)
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  /**
   * Called once before the router activates, so a refresh of an authed page lands on the
   * page rather than bouncing through the login screen.
   */
  restoreSession(): Observable<boolean> {
    if (!localStorage.getItem(REFRESH_TOKEN_KEY)) return of(false);

    return this.refresh().pipe(
      switchMap(() => this.loadCurrentUser()),
      map(() => true),
      catchError(() => {
        this.logout();
        return of(false);
      }),
    );
  }
}
