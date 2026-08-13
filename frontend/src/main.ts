import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { initSentry } from './app/core/observability/sentry';
import { environment } from './environments/environment';

/**
 * Fail loudly on an unconfigured deployment.
 *
 * A production build that still carries the placeholder API host would otherwise load
 * fine and then fail every request with an opaque network error. Better to say so.
 */
if (environment.production && environment.apiBaseUrl.includes('REPLACE-WITH')) {
  throw new Error(
    'apiBaseUrl is still the placeholder. Set it in src/environments/environment.ts ' +
      'to the deployed API origin before building for production.',
  );
}

// Before bootstrap, so errors thrown during start-up are captured too.
initSentry();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
