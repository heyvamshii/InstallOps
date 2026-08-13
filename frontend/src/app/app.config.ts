import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { requestIdInterceptor } from './core/api/request-id.interceptor';
import { provideErrorReporting } from './core/observability/sentry';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // Stated explicitly rather than relying on zone.js simply being absent: change
    // detection is driven by signals, and this is where a reader looks to confirm it.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideErrorReporting(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(withInterceptors([requestIdInterceptor, authInterceptor])),
    /**
     * Restore the session before the router runs.
     *
     * Without this, reloading an authed page would fail `authGuard` and bounce the user
     * to the login screen even though their refresh token is still good.
     */
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSession())),
  ],
};
