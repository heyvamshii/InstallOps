import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    /**
     * Restore the session before the router runs.
     *
     * Without this, reloading an authed page would fail `authGuard` and bounce the user
     * to the login screen even though their refresh token is still good.
     */
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSession())),
  ],
};
