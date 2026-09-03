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
    title: 'OneSpace'
  },
  {
    path: 'auth',
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then(m => m.AuthLayout),
    canActivate: [guestGuard],
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login').then(m => m.Login), title: 'Login - OneSpace' },
      { path: 'register', loadComponent: () => import('./features/auth/register/register').then(m => m.Register), title: 'Register - OneSpace' },
      { path: '', redirectTo: 'login', pathMatch: 'full' }
    ]
  },
  { path: 'upcoming-features', loadComponent: () => import('./features/feature-log/feature-log.component').then(m => m.FeatureLogComponent), title: 'OneSpace — Features Log' },
  {
    path: 'expenses',
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./features/expense-tracker/expense-tracker.component').then(m => m.ExpenseTrackerComponent), title: 'OneSpace — Expenses' },
      { path: 'history', loadComponent: () => import('./features/expense-tracker/pages/expense-history/expense-history.component').then(m => m.ExpenseHistoryComponent), title: 'OneSpace — Transaction History' },
      { path: 'pending', loadComponent: () => import('./features/expense-tracker/pages/expense-pending/expense-pending.component').then(m => m.ExpensePendingComponent), title: 'OneSpace — Pending Review' },
      { path: 'pending/:id/review', loadComponent: () => import('./features/expense-tracker/pages/expense-form/expense-form.component').then(m => m.ExpenseFormComponent), title: 'OneSpace — Review Pending' },
      { path: 'add', loadComponent: () => import('./features/expense-tracker/pages/expense-form/expense-form.component').then(m => m.ExpenseFormComponent), title: 'OneSpace — Log Expense' },
      { path: 'edit/:id', loadComponent: () => import('./features/expense-tracker/pages/expense-form/expense-form.component').then(m => m.ExpenseFormComponent), title: 'OneSpace — Edit Expense' },
      { path: 'categories', loadComponent: () => import('./features/expense-tracker/pages/expense-categories/expense-categories.component').then(m => m.ExpenseCategoriesComponent), title: 'OneSpace — Manage Categories' },
      { path: 'automation', loadComponent: () => import('./features/expense-tracker/pages/expense-automation/expense-automation.component').then(m => m.ExpenseAutomationComponent), title: 'OneSpace — Automation Settings' },
      { path: 'filter', loadComponent: () => import('./features/expense-tracker/pages/expense-filter/expense-filter.component').then(m => m.ExpenseFilterComponent), title: 'OneSpace — Filter Transactions' },
    ]
  },
  { path: '**', redirectTo: '' },
];
