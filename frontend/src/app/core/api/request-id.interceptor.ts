import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Tags every outbound request with a correlation id.
 *
 * The backend logs the same id and echoes it back, so a failure a user reports can be
 * traced from the browser through to the server log line that produced it.
 */
export const requestIdInterceptor: HttpInterceptorFn = (request, next) => {
  const requestId = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return next(request.clone({ setHeaders: { 'X-Request-ID': requestId } }));
};
