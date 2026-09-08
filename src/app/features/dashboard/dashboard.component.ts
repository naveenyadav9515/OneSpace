import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  afterNextRender,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
    const s = this.expenseService.summary();
    if (s && s.isCurrentMonth !== undefined) {
      return s.isCurrentMonth;
    }
    const now = new Date();
    return this.selectedMonth() === now.getMonth() + 1 && this.selectedYear() === now.getFullYear();
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
    'bl-home': 'cottage',
    'bills and rents': 'receipt_long',
    'credit card expenses': 'credit_card',
    'friends and meet-ups': 'groups',
    'kitchen utilities': 'kitchen',
    'miscellaneous expenses': 'widgets',
    office: 'business_center',
    'outside food': 'restaurant',
    parties: 'celebration',
    'previous month expenses': 'history',
    'relatives and gifts': 'redeem',
    bike: 'two_wheeler',
    naveen: 'person',
    sowji: 'face_3',
    'our expenses': 'favorite',
    health: 'medical_services',
    'our plans': 'event_upcoming',
    exceptional: 'emergency',
    helping: 'volunteer_activism',
    groceries: 'shopping_basket',
    food: 'restaurant',
    'food & dining': 'restaurant',
    dining: 'restaurant',
    transport: 'directions_car',
    transportation: 'directions_car',
    travel: 'flight',
    shopping: 'shopping_bag',
    entertainment: 'movie',
    healthcare: 'health_and_safety',
    medical: 'medical_services',
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
    other: 'category',
    miscellaneous: 'widgets',
  };

  /** Returns a Material Symbols icon name for a given category string. */
  protected getCategoryIcon(category: string): string {
    return this.categoryIconMap[category.toLowerCase().trim()] ?? 'category';
  }

  /** Dynamic color themes for categories */
  private readonly categoryColorMap: Record<string, string> = {
    'bl-home': '#6366f1',
    'bills and rents': '#eab308',
    'credit card expenses': '#a855f7',
    'friends and meet-ups': '#14b8a6',
    'kitchen utilities': '#f97316',
    'miscellaneous expenses': '#94a3b8',
    office: '#06b6d4',
    'outside food': '#f97316',
    parties: '#d946ef',
    'previous month expenses': '#94a3b8',
    'relatives and gifts': '#ec4899',
    bike: '#06b6d4',
    naveen: '#6366f1',
    sowji: '#ec4899',
    'our expenses': '#f43f5e',
    health: '#10b981',
    'our plans': '#10b981',
    exceptional: '#eab308',
    helping: '#14b8a6',
    shopping: '#EC4899',
    food: '#F59E0B',
    'food & dining': '#F59E0B',
    dining: '#F59E0B',
    groceries: '#10B981',
    utilities: '#8B5CF6',
    bills: '#8B5CF6',
    rent: '#6366F1',
    housing: '#6366F1',
    entertainment: '#A855F7',
    travel: '#3B82F6',
    transport: '#0EA5E9',
    other: '#94a3b8',
  };

  protected getCategoryColor(category: string): string {
    return this.categoryColorMap[category.toLowerCase().trim()] ?? '#06B6D4';
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

  /* ── Interactive Category Breakdown State ── */

  /** Currently hovered/focused category for two-way synchronized highlighting between ribbon & cards */
  protected readonly activeCategory = signal<string | null>(null);

  /** Whether the full category list is expanded beyond the top 3 */
  protected readonly showAllCategories = signal<boolean>(false);

  protected setActiveCategory(name: string | null): void {
    this.activeCategory.set(name);
  }

  protected toggleActiveCategory(name: string): void {
    this.activeCategory.update((current) => (current === name ? null : name));
  }

  /** Navigates to the transactions filter screen with this category pre-filtered */
  protected navigateToCategoryFilter(categoryName: string): void {
    const queryParams: Record<string, string> = {
      category: categoryName,
    };

    if (this.isCurrentMonth()) {
      queryParams['datePreset'] = 'this_month';
    } else {
      const m = this.selectedMonth();
      const y = this.selectedYear();
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      queryParams['datePreset'] = 'custom';
      queryParams['startDate'] = start;
      queryParams['endDate'] = end;
    }

    this.router.navigate(['/expenses/filter'], { queryParams });
  }

  protected toggleShowAllCategories(): void {
    this.showAllCategories.update((v) => !v);
  }

  /**
   * Processed category breakdown with:
   * 1. Collision-free color palette (ensures adjacent segments never share identical color).
   * 2. Proportional tracking with remainder spend calculation ("Other" category).
   * 3. Visible items sliced cleanly with expand/collapse state.
   */
  protected readonly breakdownData = computed(() => {
    const summary = this.expenseService.summary();
    if (!summary || !summary.topCategories || summary.topCategories.length === 0) {
      return null;
    }

    const fallbackPalette = [
      '#f43f5e', // Rose
      '#a855f7', // Purple
      '#06b6d4', // Cyan
      '#ec4899', // Pink
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#3b82f6', // Blue
      '#14b8a6', // Teal
      '#6366f1', // Indigo
      '#eab308', // Yellow
    ];

    const sumAmt = summary.topCategories.reduce((acc, cur) => acc + cur.amount, 0);

    let lastColor = '';
    const items = summary.topCategories.map((cat, idx) => {
      let color = this.categoryColorMap[cat.name.toLowerCase().trim()];
      // If color missing or identical to adjacent segment, pick unique fallback
      if (!color || color.toLowerCase() === lastColor.toLowerCase()) {
        const nextFallback = fallbackPalette.find(
          (c) => c.toLowerCase() !== lastColor.toLowerCase()
        );
        color = nextFallback ?? fallbackPalette[idx % fallbackPalette.length];
      }
      lastColor = color;

      // Normalized width share across tracked categories to guarantee 100% full-color bar width
      const barShare = sumAmt > 0 ? (cat.amount / sumAmt) * 100 : (100 / summary.topCategories.length);

      return {
        name: cat.name,
        amount: cat.amount,
        percentage: cat.percentage,
        barShare: Math.round(barShare * 10) / 10,
        color,
        icon: this.getCategoryIcon(cat.name),
        displayName: this.getCategoryDisplayName(cat.name),
      };
    });

    const isExpanded = this.showAllCategories();
    const visibleItems = isExpanded || items.length <= 3 ? items : items.slice(0, 3);

    return {
      items,
      visibleItems,
      hasMore: items.length > 3,
      remainingCount: Math.max(0, items.length - 3),
      totalTrackedPct: 100,
    };
  });

  /* ── Private Dependencies ── */
  private readonly router = inject(Router);
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
    return this.features().find((f) => f.name.toLowerCase().trim() === name.toLowerCase().trim());
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
        this.notificationService.error(
          'Failed to establish connection with server',
          'System Offline',
        );
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
