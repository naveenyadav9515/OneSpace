import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
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
import { AiAssistantInputComponent } from './components/ai-assistant-input/ai-assistant-input.component';
import { CalendarWidgetComponent } from './components/calendar-widget/calendar-widget.component';

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
    CalendarWidgetComponent,
    AiAssistantInputComponent,
    BottomNavComponent,
  ],
})
export class DashboardComponent {
  /* ── Protected Properties & Signals ── */

  protected readonly strings = APP_STRINGS;

  protected readonly dbStatus = signal<DbConnectionStatus>('connecting');
  protected readonly features = signal<Feature[]>([]);

  // Month navigation for Expense Snapshot
  protected readonly selectedMonth = signal<number>(new Date().getMonth() + 1);
  protected readonly selectedYear = signal<number>(new Date().getFullYear());

  protected readonly isCurrentMonth = computed(() => {
    const now = new Date();
    return this.selectedMonth() === (now.getMonth() + 1) && this.selectedYear() === now.getFullYear();
  });

  protected readonly selectedMonthLabel = computed(() => {
    const s = this.expenseService.summary();
    if (s?.monthName && s?.year) {
      return `${s.monthName} ${s.year}`;
    }
    const d = new Date(this.selectedYear(), this.selectedMonth() - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  protected prevMonth(): void {
    let m = this.selectedMonth() - 1;
    let y = this.selectedYear();
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    this.selectedMonth.set(m);
    this.selectedYear.set(y);
    this.expenseService.fetchSummary(m, y).subscribe();
  }

  protected nextMonth(): void {
    let m = this.selectedMonth() + 1;
    let y = this.selectedYear();
    if (m > 12) {
      m = 1;
      y += 1;
    }
    this.selectedMonth.set(m);
    this.selectedYear.set(y);
    this.expenseService.fetchSummary(m, y).subscribe();
  }

  protected resetCurrentMonth(): void {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    this.selectedMonth.set(m);
    this.selectedYear.set(y);
    this.expenseService.fetchSummary(m, y).subscribe();
  }

  /** Daily spend limit = available budget / remaining days in month */
  protected readonly dailyLimit = computed(() => {
    const s = this.expenseService.summary();
    if (!s || !s.daysLeft || s.daysLeft <= 0) return 0;
    return Math.round(s.available / s.daysLeft);
  });

  /** Daily average spend across the full month */
  protected readonly avgDailySpend = computed(() => {
    const s = this.expenseService.summary();
    if (!s || !s.daysInMonth || s.daysInMonth <= 0) return 0;
    return Math.round(s.spent / s.daysInMonth);
  });

  /** Maps common expense category names to Material Symbols icon names. */
  private readonly categoryIconMap: Record<string, string> = {
    groceries: 'local_grocery_store',
    food: 'restaurant',
    'food & dining': 'restaurant',
    dining: 'restaurant',
    transport: 'directions_car',
    transportation: 'directions_car',
    travel: 'flight',
    shopping: 'shopping_bag',
    entertainment: 'movie',
    health: 'health_and_safety',
    healthcare: 'health_and_safety',
    medical: 'local_hospital',
    utilities: 'bolt',
    bills: 'receipt_long',
    rent: 'home',
    housing: 'home',
    education: 'school',
    fitness: 'fitness_center',
    subscriptions: 'subscriptions',
    insurance: 'shield',
    clothing: 'checkroom',
    gifts: 'redeem',
    personal: 'person',
    other: 'more_horiz',
    miscellaneous: 'more_horiz',
  };

  /** Returns a Material Symbols icon name for a given category string. */
  protected getCategoryIcon(category: string): string {
    return this.categoryIconMap[category.toLowerCase().trim()] ?? 'category';
  }

  /** Short display names for categories that are too long for compact chips. */
  private readonly categoryShortNameMap: Record<string, string> = {
    groceries: 'Groc.',
    entertainment: 'Entmt',
    transportation: 'Trnsp',
    subscriptions: 'Subs.',
    miscellaneous: 'Misc.',
    healthcare: 'Health',
    'food & dining': 'Food',
    insurance: 'Insur.',
    clothing: 'Cloth.',
    education: 'Edu.',
    personal: 'Pers.',
  };

  /**
   * Returns a display-friendly category name.
   * If the name fits (≤ 10 chars), returns as-is.
   * Otherwise falls back to a curated short name, or auto-truncates.
   */
  protected getCategoryDisplayName(name: string): string {
    if (name.length <= 10) return name;
    const short = this.categoryShortNameMap[name.toLowerCase().trim()];
    if (short) return short;
    return name.substring(0, 7) + '.';
  }

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
