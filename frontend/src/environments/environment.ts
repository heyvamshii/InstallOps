/**
 * Production configuration. Replaced at build time by the CLI's fileReplacements.
 *
 * `apiBaseUrl` MUST be set to the deployed API's origin before shipping — the value
 * below is a placeholder, and the app fails loudly at start-up rather than silently
 * issuing requests to a host that is not yours.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://REPLACE-WITH-YOUR-API-HOST',
  sentryDsn: '',
  release: '0.1.0',
};
