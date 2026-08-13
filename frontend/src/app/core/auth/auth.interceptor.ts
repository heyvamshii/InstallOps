import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';

import { AuthService, SKIP_AUTH } from './auth.service';

function withBearer(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Attaches the access token, and on a 401 refreshes once and replays the request.
 *
 * Retries exactly once: if the replayed request also 401s, the session is genuinely dead
 * and looping would just hammer the API on every navigation.
 */
export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  if (request.context.get(SKIP_AUTH)) return next(request);

  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();
  const authorized = token ? withBearer(request, token) : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap((fresh) => next(withBearer(request, fresh))),
        catchError((refreshError: unknown) => {
          auth.logout();
          void router.navigate(['/login'], {
            queryParams: { returnUrl: router.url },
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
