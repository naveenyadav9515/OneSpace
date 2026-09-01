import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  Expense,
  ExpenseService,
  PendingTransaction
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

/* ── Projection chart label layout ──────────────────────────────────────────
 * All values are percentages of the plot height (118px), so a label is ~15%
 * tall. The upper bound exceeds 100 because the plot carries a top margin the
 * labels are allowed to use.
 */
const PROJ_TAG_PCT = 15.3;
const PROJ_TAG_SEP = PROJ_TAG_PCT + 4.5;
const PROJ_TAG_LO = PROJ_TAG_PCT / 2;
const PROJ_TAG_HI = 112;
const PROJ_BUDGET_HI = 88;

function clampTo(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function nearestFreeSlot(preferred: number, occupied: number[], lo: number, hi: number): number {
  const isFree = (cand: number) =>
    occupied.every(other => Math.abs(cand - other) >= PROJ_TAG_SEP);

  const clamped = clampTo(preferred, lo, hi);
  if (isFree(clamped)) return clamped;

  const N = 40;
  const step = (hi - lo) / N;
  let bestPos = clamped;
  let bestDist = Infinity;

  for (let i = 0; i <= N; i++) {
    const cand = lo + i * step;
    if (isFree(cand)) {
      const dist = Math.abs(cand - preferred);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = cand;
      }
    }
  }

  return bestPos;
}

function deconflictTags(budgetY: number, spentY: number, projY: number) {
  const budget = clampTo(budgetY, PROJ_TAG_LO, PROJ_BUDGET_HI);
  const spent = nearestFreeSlot(spentY, [budget], PROJ_TAG_LO, PROJ_TAG_HI);
  const proj = nearestFreeSlot(projY, [budget, spent], PROJ_TAG_LO, PROJ_TAG_HI);

  return { budgetTagY: budget, spentTagY: spent, projTagY: proj };
}

@Component({
  selector: 'app-expense-tracker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BottomNavComponent],
  templateUrl: './expense-tracker.component.html',
  styleUrl: './expense-tracker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseTrackerComponent implements OnInit {
  protected readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);

  protected readonly expenses = signal<Expense[]>([]);
  protected readonly pendingTransactions = signal<PendingTransaction[]>([]);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly isSettingsDropdownOpen = signal(false);

  // Spending trend hover/pin state
  protected readonly hoveredBar = signal<number | null>(null);
  protected readonly selectedDay = signal<number | null>(null);

  // Month navigation
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

  // Budget editing state
  protected readonly isEditingBudget = signal(false);
  protected readonly isSavingBudget = signal(false);
  protected readonly budgetControl = new FormControl<number | null>(null, [
    Validators.required,
    Validators.min(1),
  ]);

  ngOnInit() {
    this.fetchExpenses();
    this.fetchPendingTransactions();
    this.fetchSummary();
  }

  protected fetchSummary() {
    this.expenseService.fetchSummary(this.selectedMonth(), this.selectedYear()).subscribe();
  }

  protected prevMonth(): void {
    let m = this.selectedMonth() - 1;
    let y = this.selectedYear();
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    this.selectedMonth.set(m);
    this.selectedYear.set(y);
    this.fetchSummary();
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
    this.fetchSummary();
  }

  protected resetCurrentMonth(): void {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    this.selectedMonth.set(m);
    this.selectedYear.set(y);
    this.fetchSummary();
  }

  protected fetchExpenses() {
    this.isLoading.set(true);
    this.expenseService.fetchExpenses().subscribe({
      next: (res) => {
        this.expenses.set(res.data || []);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  protected fetchPendingTransactions() {
    this.expenseService.fetchPendingTransactions().subscribe({
      next: (res) => {
        this.pendingTransactions.set(res.data || []);
      },
      error: (err) => console.error('Error fetching pending transactions', err),
    });
  }

  protected openBudgetEditor() {
    const target = this.expenseService.summary()?.budgetTarget ?? 30000;
    this.startBudgetEdit(target);
  }

  protected startBudgetEdit(currentBudget: number) {
    this.budgetControl.setValue(currentBudget);
    this.isEditingBudget.set(true);
  }

  protected cancelBudgetEdit() {
    this.isEditingBudget.set(false);
    this.budgetControl.reset();
  }

  protected saveBudget() {
    const value = Number(this.budgetControl.value);
    if (!Number.isFinite(value) || value <= 0) return;

    this.isSavingBudget.set(true);
    this.expenseService.updateBudget(Math.round(value)).subscribe({
      next: () => {
        this.isSavingBudget.set(false);
        this.cancelBudgetEdit();
        this.fetchSummary();
        this.notificationService.success('Monthly budget updated.', 'Saved');
      },
      error: (err) => {
        this.isSavingBudget.set(false);
        this.notificationService.error(
          err?.error?.message || 'Please try again.',
          'Could not update budget'
        );
      },
    });
  }

  protected toggleDayDetail(index: number) {
    this.selectedDay.update((current) => (current === index ? null : index));
  }

  protected isDayDetailOpen(index: number): boolean {
    return this.selectedDay() === index || this.hoveredBar() === index;
  }

  protected readonly recentExpenses = computed(() => {
    const m = this.selectedMonth() - 1;
    const y = this.selectedYear();
    const monthTxns = this.expenses().filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === m && d.getFullYear() === y;
    });

    return [...(monthTxns.length ? monthTxns : this.expenses())]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  });

  protected readonly dailyLimit = computed(() => {
    const sum = this.expenseService.summary();
    if (!sum) return 0;
    if (sum.daysLeft <= 0) return sum.available;
    return Math.floor(sum.available / sum.daysLeft);
  });

  protected readonly trendDays = computed(() => {
    const trend = this.expenseService.summary()?.spendingTrend;
    if (!trend) return [];
    if (trend.days?.length) return trend.days;

    return (trend.labels ?? []).map((label, i) => ({
      label,
      dayOfMonth: 0,
      month: '',
      date: `${label}-${i}`,
      amount: trend.data?.[i] ?? 0,
      isToday: false,
      isFuture: false,
    }));
  });

  protected readonly peakDayAmount = computed(() =>
    Math.max(...this.trendDays().map((d) => d.amount), 1)
  );

  protected readonly trendPoints = computed(() => {
    const days = this.trendDays();
    const max = this.peakDayAmount();
    const last = days.length - 1;

    return days.map((d, i) => ({
      ...d,
      xPct: last <= 0 ? 50 : (i / last) * 100,
      yPct: (d.amount / max) * 100,
    }));
  });

  protected readonly trendLinePath = computed(() =>
    this.trendPoints()
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct.toFixed(2)} ${(100 - p.yPct).toFixed(2)}`)
      .join(' ')
  );

  protected readonly trendAreaPath = computed(() => {
    const pts = this.trendPoints();
    if (pts.length === 0) return '';

    const body = pts.map((p) => `L ${p.xPct.toFixed(2)} ${(100 - p.yPct).toFixed(2)}`).join(' ');
    return `M ${pts[0].xPct.toFixed(2)} 100 ${body} L ${pts[pts.length - 1].xPct.toFixed(2)} 100 Z`;
  });

  protected formatCompact(amount: number): string {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
    return `₹${Math.round(amount)}`;
  }

  protected readonly currentMonthLabel = computed(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  protected readonly dailyPace = computed(() => {
    const s = this.expenseService.summary();
    if (!s) return 0;
    const day = s.dayOfMonth || 1;
    return Math.round(s.spent / Math.max(1, day));
  });

  protected readonly weekRangeLabel = computed(() => {
    const days = this.trendDays();
    if (days.length === 0) return '';

    const first = days[0];
    const last = days[days.length - 1];
    if (!first.dayOfMonth) return 'Last 7 days';

    return first.month === last.month
      ? `${first.month} ${first.dayOfMonth} – ${last.dayOfMonth}`
      : `${first.month} ${first.dayOfMonth} – ${last.month} ${last.dayOfMonth}`;
  });

  protected readonly projection = computed(() => {
    const s = this.expenseService.summary();
    if (!s?.forecast) return null;

    const budget = s.budgetTarget;
    const projected = s.forecast.estimatedSpend;
    const spent = s.spent;
    const scaleMax = Math.max(projected, budget) || 1;

    const spentWithin = Math.min(spent, budget);
    const forecastWithin = Math.max(0, Math.min(projected, budget) - spent);
    const over = Math.max(0, projected - budget);

    return {
      spentPct: (spentWithin / scaleMax) * 100,
      forecastPct: (forecastWithin / scaleMax) * 100,
      overPct: (over / scaleMax) * 100,
      budgetPct: (budget / scaleMax) * 100,
      overAmount: over,
      isOver: over > 0,
    };
  });

  protected readonly monthProjection = computed(() => {
    const s = this.expenseService.summary();
    const daily = s?.monthDaily;
    if (!s?.forecast || !daily?.length) return null;

    const daysInMonth = daily.length;
    const today = Math.min(s.dayOfMonth ?? daysInMonth, daysInMonth);
    const budget = s.budgetTarget;
    const projected = s.forecast.estimatedSpend;

    const scaleMax = Math.max(projected, budget, daily.reduce((a, b) => a + b, 0)) || 1;
    const x = (day: number) => ((day - 1) / Math.max(1, daysInMonth - 1)) * 100;
    const y = (amount: number) => (amount / scaleMax) * 100;

    let running = 0;
    const actual = daily.slice(0, today).map((amount, i) => {
      running += amount;
      return { day: i + 1, total: running, xPct: x(i + 1), yPct: y(running) };
    });

    const spentToDate = running;
    const crossesBudget = projected > budget;

    return {
      actualPath: actual.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct.toFixed(2)} ${(100 - p.yPct).toFixed(2)}`).join(' '),
      areaPath: actual.length
        ? `M ${actual[0].xPct.toFixed(2)} 100 ${actual.map(p => `L ${p.xPct.toFixed(2)} ${(100 - p.yPct).toFixed(2)}`).join(' ')} L ${actual[actual.length - 1].xPct.toFixed(2)} 100 Z`
        : '',
      forecastPath: `M ${x(today).toFixed(2)} ${(100 - y(spentToDate)).toFixed(2)} L ${x(daysInMonth).toFixed(2)} ${(100 - y(projected)).toFixed(2)}`,
      budgetYPct: y(budget),
      todayXPct: x(today),
      todayYPct: y(spentToDate),
      ...deconflictTags(y(budget), y(spentToDate), y(projected)),
      endYPct: y(projected),
      spentToDate,
      projected,
      budget,
      remaining: Math.max(0, budget - spentToDate),
      overBy: Math.max(0, projected - budget),
      crossesBudget,
      daysInMonth,
      today,
    };
  });
}
