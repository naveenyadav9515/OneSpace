import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

/**
 * Global Routing Table.
 *
 * Defines entry paths for dashboard features:
 * - Empty path defaults to the main Dashboard view.
 * - `upcoming-features` routes to the isolated feature log logger.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    title: 'MyDesk'
  },
  {
    path: 'auth',
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then(m => m.AuthLayout),
    canActivate: [guestGuard],
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login').then(m => m.Login), title: 'Login - MyDesk' },
      { path: 'register', loadComponent: () => import('./features/auth/register/register').then(m => m.Register), title: 'Register - MyDesk' },
      { path: '', redirectTo: 'login', pathMatch: 'full' }
    ]
  },
  { path: 'upcoming-features', loadComponent: () => import('./features/feature-log/feature-log.component').then(m => m.FeatureLogComponent), title: 'MyDesk — Features Log' },
  { path: 'expenses', loadComponent: () => import('./features/expense-tracker/expense-tracker.component').then(m => m.ExpenseTrackerComponent), canActivate: [authGuard], title: 'Expense Tracker' },
  { path: '**', redirectTo: '' },
];
