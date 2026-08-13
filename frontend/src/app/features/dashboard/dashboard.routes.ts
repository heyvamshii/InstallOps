import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { InMemoryCache } from '@apollo/client';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';

import { environment } from '../../../environments/environment';

/**
 * Apollo is provided at the route rather than in the application config, so the client
 * ships inside this lazy chunk instead of the initial bundle. Only one screen speaks
 * GraphQL; everyone who never opens the overview should not pay for it — that was ~41 kB
 * gzipped on first load when it was provided at the root.
 *
 * `HttpLink` builds on Angular's HttpClient, so the auth interceptor attaches the token
 * and handles 401 refresh for GraphQL exactly as it does for REST.
 */
export const routes: Routes = [
  {
    path: '',
    providers: [
      provideApollo(() => ({
        link: inject(HttpLink).create({ uri: `${environment.apiBaseUrl}/graphql/` }),
        cache: new InMemoryCache(),
      })),
    ],
    loadComponent: () => import('./dashboard').then((m) => m.Dashboard),
    title: 'Overview · InstallOps',
  },
];
