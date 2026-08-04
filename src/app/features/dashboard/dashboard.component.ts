import {
  Component,
  ChangeDetectionStrategy,
  signal,
  afterNextRender,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '@core/services/api.service';
import { Feature } from '@core/models/feature.model';
import { NotificationService } from '@core/services/notification.service';
import { ExpenseService } from '@core/services/expense.service';
import { DbConnectionStatus, APP_STRINGS } from '@core/constants/app.constants';

import { LoaderComponent, BottomNavComponent } from '../../shared/components';
import { HomeHeaderComponent } from './components/home-header/home-header.component';
import { AiInsightsComponent } from './components/ai-insights/ai-insights.component';
import { PriorityRemindersComponent } from './components/priority-reminders/priority-reminders.component';
import { DailyRoutineComponent } from './components/daily-routine/daily-routine.component';
import { AiAssistantInputComponent } from './components/ai-assistant-input/ai-assistant-input.component';

/**
 * Home Component.
 *
 * The app's landing page. Owns data loading and composition only — each band of
 * the screen is its own component, so this file stays a readable list of what
 * the home screen is made of rather than the union of every section's markup.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoaderComponent,
    RouterLink,
    DecimalPipe,
    HomeHeaderComponent,
    AiInsightsComponent,
    PriorityRemindersComponent,
    DailyRoutineComponent,
    AiAssistantInputComponent,
    BottomNavComponent,
  ],
})
export class DashboardComponent {
  /* ── Protected Properties & Signals ── */

  protected readonly strings = APP_STRINGS;

  protected readonly dbStatus = signal<DbConnectionStatus>('connecting');
  protected readonly features = signal<Feature[]>([]);

  /* ── Private Dependencies ── */
  private readonly apiService = inject(ApiService);
  private readonly notificationService = inject(NotificationService);
  protected readonly expenseService = inject(ExpenseService);

  constructor() {
    afterNextRender(() => {
      this.loadApiData();
    });
  }

  /* ── Protected Methods ── */

  /** Gets a loaded feature by name */
  protected getFeature(name: string): Feature | undefined {
    return this.features().find(
      (f) => f.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
  }

  /* ── Private Methods ── */

  /** Fetches the data every section of the home screen reads from. */
  private loadApiData(): void {
    this.apiService.fetchHealth().subscribe({
      // The health probe exists to detect an unreachable API; `dbStatus` is set
      // to connected by fetchFeatures below, which proves rather more.
      next: () => {},
      error: () => {
        this.dbStatus.set('error');
        this.notificationService.error('Failed to establish connection with server', 'System Offline');
      },
    });

    this.apiService.fetchFeatures().subscribe({
      next: (res) => {
        this.features.set(res.data);
        this.dbStatus.set('connected');
      },
      error: () => {
        this.dbStatus.set('error');
      },
    });

    this.expenseService.fetchSummary().subscribe();
  }
}
