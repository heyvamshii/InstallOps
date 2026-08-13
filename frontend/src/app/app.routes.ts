import { Routes } from '@angular/router';

import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
    title: 'Sign in · InstallOps',
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'jobs' },
      {
        path: 'dashboard',
        canMatch: [roleGuard('COORDINATOR', 'ADMIN')],
        // loadChildren, not loadComponent, so the route's Apollo providers stay lazy too.
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.routes),
      },
      {
        path: 'jobs',
        loadComponent: () =>
          import('./features/jobs/job-list/job-list').then((m) => m.JobList),
        title: 'Jobs · InstallOps',
      },
      {
        path: 'jobs/:id',
        loadComponent: () =>
          import('./features/jobs/job-detail/job-detail').then((m) => m.JobDetail),
        title: 'Job · InstallOps',
      },
      {
        path: 'admin/users',
        canMatch: [roleGuard('ADMIN')],
        loadComponent: () =>
          import('./features/admin/user-directory').then((m) => m.UserDirectory),
        title: 'People · InstallOps',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
