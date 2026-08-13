import { ErrorHandler, Provider } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Error reporting, loaded only when a DSN is configured.
 *
 * The import is dynamic on purpose: with no DSN — every local run, and any fork of this
 * repo — Sentry never enters the bundle at all rather than shipping dead weight to
 * every visitor.
 */
export function initSentry(): void {
  if (!environment.sentryDsn) return;

  void import('@sentry/angular').then((Sentry) => {
    Sentry.init({
      dsn: environment.sentryDsn,
      release: environment.release,
      environment: environment.production ? 'production' : 'development',
      tracesSampleRate: 0.1,
      // Do not ship user input or tokens to a third party by default.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.headers) delete event.request.headers['Authorization'];
        return event;
      },
    });
  });
}

/**
 * Angular's default ErrorHandler logs to the console; this also forwards to Sentry when
 * it is active. Kept as a plain class so no Sentry symbol is referenced at module load.
 */
export class ReportingErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);

    if (!environment.sentryDsn) return;
    void import('@sentry/angular').then((Sentry) => Sentry.captureException(error));
  }
}

export function provideErrorReporting(): Provider {
  return { provide: ErrorHandler, useClass: ReportingErrorHandler };
}
