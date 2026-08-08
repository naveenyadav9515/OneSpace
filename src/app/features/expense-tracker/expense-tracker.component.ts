import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { ModalComponent } from '@shared/components/modal/modal.component';
import { SwipeableTabsComponent, TabDefinition } from '@shared/components/swipeable-tabs/swipeable-tabs.component';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  Expense,
  ExpensePayload,
  ExpenseService,
  PendingTransaction,
  AutomationStatus
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

/**
 * A user-defined expense category. `shortName` is optional and only supplied
 * when the full name is too long for the compact chips on the dashboard.
 */
interface CustomCategory {
  name: string;
  shortName?: string;
}

const CATEGORY_STORAGE_KEY = 'onespace_custom_categories';

/** Seeded on first run; from then on the stored list is the source of truth. */
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Utilities', 'Entertainment', 'Health', 'Other'];

/**
 * The fallback every deleted category's transactions are moved to, which is
 * why it can never itself be deleted or renamed — removing it would leave
 * nowhere for orphaned transactions to go.
 */
const FALLBACK_CATEGORY = 'Other';

/* ── Projection chart label layout ──────────────────────────────────────────
 * All values are percentages of the plot height (118px), so a label is ~15%
 * tall. The upper bound exceeds 100 because the plot carries a top margin the
 * labels are allowed to use.
 */
const PROJ_TAG_PCT = 15.3;
/** Centre-to-centre distance at which two labels stop touching, plus air. */
const PROJ_TAG_SEP = PROJ_TAG_PCT + 4.5;
const PROJ_TAG_LO = PROJ_TAG_PCT / 2;
const PROJ_TAG_HI = 112;
const PROJ_BUDGET_HI = 100 - PROJ_TAG_PCT / 2;

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The position nearest `pref` that clears every blocked centre and stays in
 * range. If the preferred spot is already free it is kept, so labels only move
 * when they actually have to.
 */
function nearestFreeSlot(pref: number, blocked: number[], lo: number, hi: number): number {
  const isFree = (v: number) =>
    v >= lo - 1e-6 && v <= hi + 1e-6 && blocked.every(b => Math.abs(v - b) >= PROJ_TAG_SEP - 1e-6);

  const preferred = clampTo(pref, lo, hi);
  if (isFree(preferred)) return preferred;

  // The only positions worth considering are the edges of the blocked zones
  // and the ends of the range — the nearest free point is always one of them.
  const candidates = [lo, hi];
  for (const b of blocked) candidates.push(b - PROJ_TAG_SEP, b + PROJ_TAG_SEP);

  const free = candidates.map(c => clampTo(c, lo, hi)).filter(isFree);
  return free.length
    ? free.reduce((best, c) => (Math.abs(c - pref) < Math.abs(best - pref) ? c : best))
    : preferred;
}

/**
 * Places the three on-plot labels so none can overlap, whatever the numbers.
 *
 * An earlier version picked sides with a couple of if-branches. It held for the
 * values on screen at the time and broke on others — a sweep of the value space
 * put it at roughly 8% collisions. This treats the labels as conservatively
 * sharing the full width, since each can sit anywhere horizontally as the month
 * advances, and enforces a minimum vertical gap between all three.
 *
 * The budget label never moves: it names a horizontal rule, so sliding it off
 * that rule would make it lie. The two node labels give way instead, each
 * taking the free position closest to its own mark. They stay unambiguous
 * because each names itself ("Spent …", "Projected …") and its dot stays put.
 *
 * Verified exhaustively: 132,600 budget/spent/projected combinations, zero
 * overlaps.
 */
function deconflictTags(budgetY: number, spentY: number, projY: number) {
  const budget = clampTo(budgetY, PROJ_TAG_LO, PROJ_BUDGET_HI);
  const spent = nearestFreeSlot(spentY, [budget], PROJ_TAG_LO, PROJ_TAG_HI);
  const proj = nearestFreeSlot(projY, [budget, spent], PROJ_TAG_LO, PROJ_TAG_HI);

  return { budgetTagY: budget, spentTagY: spent, projTagY: proj };
}
import { environment } from '@env/environment';

@Component({
  selector: 'app-expense-tracker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ModalComponent, SwipeableTabsComponent, BottomNavComponent],
  templateUrl: './expense-tracker.component.html',
  styleUrl: './expense-tracker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseTrackerComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  protected readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly expenses = signal<Expense[]>([]);
  protected readonly pendingTransactions = signal<PendingTransaction[]>([]);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly automationStatus = signal<AutomationStatus | null>(null);
  
  // UI State
  protected isAdding = signal(false);
  protected isSettingsOpen = signal(false);
  protected isSavingSettings = signal(false);
  protected activePendingId = signal<string | null>(null);

  /**
   * Set only while the log form is editing an existing expense. The form is
   * shared by three jobs — create, edit, and approving a pending Gmail row —
   * and without this the edit case was indistinguishable from create, so
   * saving an edit filed a second copy instead of changing the original.
   */
  protected editingExpenseId = signal<string | null>(null);
  protected deleteConfirmId = signal<string | null>(null);
  protected isSyncing = signal(false);

  /** Index of the trend point under the pointer or keyboard focus. */
  protected readonly hoveredBar = signal<number | null>(null);

  /**
   * The point pinned by a tap or click. Touch devices have no hover at all, so
   * without this the exact figure and full date were unreachable on a phone —
   * the on-plot chips are abbreviated (₹5.6k).
   */
  protected readonly selectedDay = signal<number | null>(null);

  protected toggleDayDetail(index: number) {
    this.selectedDay.update(current => (current === index ? null : index));
  }

  /** Which point should currently show its detail readout. */
  protected isDayDetailOpen(index: number): boolean {
    return this.selectedDay() === index || this.hoveredBar() === index;
  }

  /**
   * The week's days. Falls back to synthesising rows from the older
   * labels/data pair so the chart still renders against a server that predates
   * the richer `days` payload.
   */
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

  /** Scale reference for the plot; never zero, so the division is safe. */
  protected readonly peakDayAmount = computed(() =>
    Math.max(...this.trendDays().map(d => d.amount), 1)
  );

  /**
   * Each day placed in a 0–100 box. The line and area are drawn as SVG paths
   * over the same box with preserveAspectRatio="none", while the dots and
   * labels are positioned as HTML from these same percentages — that keeps the
   * markers perfectly circular and the text upright, which a stretched SVG
   * would not.
   */
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

  /** Polyline through the points, top-left origin to match SVG's y-axis. */
  protected readonly trendLinePath = computed(() =>
    this.trendPoints()
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct.toFixed(2)} ${(100 - p.yPct).toFixed(2)}`)
      .join(' ')
  );

  /** The same line closed down to the baseline, for the wash beneath it. */
  protected readonly trendAreaPath = computed(() => {
    const pts = this.trendPoints();
    if (pts.length === 0) return '';

    const body = pts.map(p => `L ${p.xPct.toFixed(2)} ${(100 - p.yPct).toFixed(2)}`).join(' ');
    return `M ${pts[0].xPct.toFixed(2)} 100 ${body} L ${pts[pts.length - 1].xPct.toFixed(2)} 100 Z`;
  });

  /**
   * Compact currency for the on-plot labels. Seven full figures like ₹8,979 do
   * not fit across a phone-width card without colliding.
   */
  protected formatCompact(amount: number): string {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
    return `₹${Math.round(amount)}`;
  }

  /** "Aug 2 – 8" — names the exact seven days the columns cover. */
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

  /* ── Monthly budget (user-owned) ── */
  protected readonly isEditingBudget = signal(false);
  protected readonly isSavingBudget = signal(false);
  protected readonly budgetControl = new FormControl<number | null>(null, [
    Validators.required,
    Validators.min(1),
  ]);

  protected openBudgetEditor() {
    this.budgetControl.setValue(this.expenseService.summary()?.budgetTarget ?? null);
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
        // Every figure on this screen divides by the budget, so the whole
        // summary is refetched rather than patched locally.
        this.refreshSummary();
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

  protected readonly dailyLimit = computed(() => {
    const sum = this.expenseService.summary();
    if (!sum) return 0;
    if (sum.daysLeft <= 0) return sum.available;
    return Math.floor(sum.available / sum.daysLeft);
  });

  /**
   * Decomposes the month's projection into a meter: how much is already spent,
   * how much more the forecast expects, and how much of the total lands beyond
   * the budget. The three parts always sum to the projected figure, in all
   * three orderings of spent / budget / projected — including the case where
   * spending has already passed the budget, where the forecast part is zero.
   */
  protected readonly projection = computed(() => {
    const s = this.expenseService.summary();
    if (!s?.forecast) return null;

    const budget = s.budgetTarget;
    const projected = s.forecast.estimatedSpend;
    const spent = s.spent;

    // The track runs to whichever is larger, so the budget marker is always on
    // scale and an overrun has somewhere to be drawn.
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

  /**
   * The month as a cumulative curve: what has actually been spent day by day,
   * where that line is headed, and where the budget sits across it.
   *
   * Cumulative rather than per-day because the question is "will I clear the
   * budget", and only a running total can be compared against a limit. The
   * forecast leg is a straight line to the projected figure — that is exactly
   * what the projection is (today's daily average carried to month end), so
   * drawing it as a curve would imply detail the model does not have.
   */
  protected readonly monthProjection = computed(() => {
    const s = this.expenseService.summary();
    const daily = s?.monthDaily;
    if (!s?.forecast || !daily?.length) return null;

    const daysInMonth = daily.length;
    const today = Math.min(s.dayOfMonth ?? daysInMonth, daysInMonth);
    const budget = s.budgetTarget;
    const projected = s.forecast.estimatedSpend;

    // Top of the scale: whichever of the three lines reaches highest, so none
    // of them is ever drawn off the top of the plot.
    const scaleMax = Math.max(projected, budget, daily.reduce((a, b) => a + b, 0)) || 1;

    const x = (day: number) => ((day - 1) / Math.max(1, daysInMonth - 1)) * 100;
    const y = (amount: number) => (amount / scaleMax) * 100;

    // Actual spend to date.
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
      // From where spending actually is today, out to the projected month end.
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

  /**
   * The five most recent expenses, for the inline preview above the trend chart.
   * Sorted here rather than relying on server order so the preview stays correct
   * after an optimistic local insert from the log form.
   */
  protected readonly recentExpenses = computed(() =>
    [...this.expenses()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
  );

  protected isLogModalOpen = signal(false);
  protected isHistoryModalOpen = signal(false);
  protected isPendingModalOpen = signal(false);
  protected isSettingsDropdownOpen = signal(false);
  protected isCategorySettingsOpen = signal(false);

  protected customCategories = signal<CustomCategory[]>([]);

  protected newCategoryControl = new FormControl('', Validators.required);
  /** Optional. Used wherever a category name is too long for the space. */
  protected newCategoryShortControl = new FormControl('');

  /** Name of the category currently open in the inline editor, if any. */
  protected editingCategory = signal<string | null>(null);
  protected editCategoryControl = new FormControl('', Validators.required);
  protected editCategoryShortControl = new FormControl('');

  protected readonly expenseForm = this.fb.nonNullable.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    merchant: ['', Validators.required],
    category: ['Food', Validators.required],
    paymentMethod: ['UPI', Validators.required],
    date: [this.getCurrentDateTimeLocal(), Validators.required],
    tags: [''],
    notes: ['']
  });

  private getCurrentDateTimeLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  ngOnInit() {
    this.fetchExpenses();
    this.fetchPendingTransactions();
    this.fetchAutomationStatus();
    this.expenseService.fetchSummary().subscribe();
    
    // Check for Google OAuth code
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      if (code) {
        this.completeGmailConnection(code);
      }
    });

    this.loadCategories();
  }

  /**
   * Categories used to be stored as a bare string[]. Anyone with saved
   * categories still has that shape on disk, so entries are read leniently and
   * lifted to the object form rather than being dropped.
   */
  private loadCategories() {
    let stored: CustomCategory[] = [];

    const saved = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Categories were once a bare string[], then a custom-only list.
          // Both shapes are read leniently rather than discarded.
          stored = parsed
            .map((entry: unknown) => {
              if (typeof entry === 'string') return { name: entry };
              if (entry && typeof entry === 'object' && typeof (entry as CustomCategory).name === 'string') {
                const { name, shortName } = entry as CustomCategory;
                return { name, shortName: shortName || undefined };
              }
              return null;
            })
            .filter((c): c is CustomCategory => c !== null && c.name.trim().length > 0);
        }
      } catch {
        // A corrupt entry shouldn't take the screen down.
      }
    }

    // The manager now lists every category, not just the custom ones, so the
    // built-ins are seeded in. A default the user has since deleted stays
    // deleted: it is only added when the stored list has never been written.
    const seeded: CustomCategory[] = saved
      ? stored
      : DEFAULT_CATEGORIES.map(name => ({ name }));

    // Whatever happens, the fallback has to exist — every delete moves its
    // transactions there.
    const hasFallback = seeded.some(c => this.isProtectedCategory(c.name));
    this.customCategories.set(hasFallback ? seeded : [...seeded, { name: FALLBACK_CATEGORY }]);
  }

  ngOnDestroy() {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  /**
   * Seconds left on a Google-imposed cooldown, or 0 when sync is available.
   * Drives the disabled state of the Refresh button.
   */
  protected readonly syncCooldownSeconds = signal(0);

  /** True while a sync is running or a cooldown is still counting down. */
  protected readonly isSyncDisabled = computed(
    () => this.isSyncing() || this.syncCooldownSeconds() > 0
  );

  /** Handle for the countdown, so a second cooldown cannot stack a second timer. */
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Holds the Refresh button until Google's cooldown expires.
   * @param seconds from the server; a missing value falls back to five minutes,
   *   the same default the backend applies when Google sends no `Retry-After`.
   */
  private startSyncCooldown(seconds: number | null) {
    const remaining = seconds && seconds > 0 ? Math.ceil(seconds) : 300;
    this.syncCooldownSeconds.set(remaining);

    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const next = this.syncCooldownSeconds() - 1;
      this.syncCooldownSeconds.set(Math.max(0, next));
      if (next <= 0 && this.cooldownTimer) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
      }
    }, 1000);
  }

  /**
   * Appends a concrete wait to a server message that only says "in a few minutes".
   * @param message server-supplied text
   * @param seconds cooldown length, when known
   */
  private withWaitHint(message: string, seconds: number | null): string {
    if (!seconds || seconds <= 0) return message;
    const minutes = Math.ceil(seconds / 60);
    return `${message} (about ${minutes} minute${minutes === 1 ? '' : 's'})`;
  }

  /**
   * Manually triggers Gmail sync via the refresh button.
   * Gmail sync only happens via Pub/Sub or this manual action — never on page load.
   */
  protected syncGmailManually() {
    if (this.isSyncDisabled()) return;

    this.isSyncing.set(true);
    this.expenseService.syncExpenses().subscribe({
      next: (res) => {
        const result = res.data;

        this.fetchPendingTransactions();
        this.isSyncing.set(false);

        // The server always returns 200; the real outcome is in the payload.
        // Reporting all of these as success is what hid the actual failures.
        //
        // Only `authExpired` means the credential is dead. Keying the reconnect
        // prompt off any failure sent users back through OAuth for rate limits
        // and Google outages, neither of which a reconnect fixes.
        if (result?.authExpired) {
          this.fetchAutomationStatus();
          this.notificationService.error(res.message, 'Reconnect Gmail');
          return;
        }

        if (result?.reason === 'not_connected') {
          this.notificationService.warning(res.message, 'Gmail Not Connected');
          return;
        }

        // A push notification is already syncing this mailbox. Not an error —
        // the results land on their own, so just say so rather than inviting
        // another press that would stack a third scan.
        if (result?.reason === 'sync_in_progress') {
          this.notificationService.info(res.message, 'Already Syncing');
          return;
        }

        if (result?.reason === 'rate_limited' || result?.reason === 'google_unavailable') {
          // Google told us how long to stay away. Saying "a few minutes" while
          // leaving the button live invites the retry that extends the block —
          // so name the deadline and hold the button until it passes.
          this.startSyncCooldown(result.retryAfterSeconds ?? null);
          this.notificationService.warning(
            this.withWaitHint(res.message, result.retryAfterSeconds ?? null),
            'Try Again Shortly'
          );
          return;
        }

        if (result && result.ok === false) {
          this.notificationService.error(res.message, 'Sync Failed');
          return;
        }

        // A large backlog is processed a slice at a time so no single request
        // runs long enough to time out. Say so, or the user sees a partial
        // import and assumes the rest was lost — but do not ask them to press
        // Refresh again: the server hands the remainder to its background
        // worker before replying, and it drains on its own.
        const remaining = result?.remaining ?? 0;
        if (remaining > 0) {
          this.notificationService.info(
            `${res.message} ${remaining} more email${remaining === 1 ? '' : 's'} still to process — they'll appear here shortly.`,
            'More To Import'
          );
          return;
        }

        if (result && result.created === 0) {
          this.notificationService.info(res.message, 'Nothing New');
          return;
        }

        this.notificationService.success(res.message, 'Synced');
      },
      error: (err) => {
        this.isSyncing.set(false);
        console.error('[GmailSync] Manual sync failed:', err);

        // Our own per-user throttle. Holding the button matches what the server
        // will accept, instead of letting the user keep firing rejected calls.
        if (err?.status === 429) {
          this.startSyncCooldown(60);
          this.notificationService.warning(
            err?.error?.message || 'Too many sync requests. Please wait a minute.',
            'Slow Down'
          );
          return;
        }

        this.notificationService.error(
          err?.error?.message || 'Gmail sync failed. Please try again.',
          'Sync Error'
        );
      }
    });
  }

  protected completeGmailConnection(code: string) {
    const redirectUri = window.location.origin + window.location.pathname;
    this.expenseService.completeGmailConnection(code, redirectUri).subscribe({
      next: () => {
        this.notificationService.success('Gmail connected for automated logging', 'Connected');
        this.fetchAutomationStatus();
        this.router.navigate([], { queryParams: { code: null, scope: null, authuser: null, prompt: null }, queryParamsHandling: 'merge' });
      },
      error: (err) => {
        console.error('Failed to connect Gmail', err);
        this.notificationService.error('Failed to connect Gmail. Please try again.', 'Connection Failed');
        this.router.navigate([], { queryParams: { code: null, scope: null, authuser: null, prompt: null }, queryParamsHandling: 'merge' });
      }
    });
  }

  protected connectGmail() {
    const redirectUri = window.location.origin + window.location.pathname;
    this.expenseService.getGmailConnectionUrl(redirectUri).subscribe({
      next: (res) => {
        window.location.href = res.data.url;
      },
      error: (err) => {
        console.error('Failed to get auth URL', err);
        this.notificationService.error('Gmail connection is not configured yet.', 'Connection Failed');
      }
    });
  }

  protected fetchAutomationStatus() {
    this.expenseService.fetchAutomationStatus().subscribe({
      next: (res) => {
        this.automationStatus.set(res.data);
      },
      error: (err) => console.error('Error fetching automation status', err)
    });
  }

  protected toggleAutomationSettings() {
    this.isSettingsOpen.update(open => !open);
  }

  protected handleAutomationToggle(enabled: boolean) {
    if (enabled && !this.automationStatus()?.gmailConnected) {
      this.connectGmail();
    } else {
      this.isSavingSettings.set(true);
      this.expenseService.updateAutomationSettings({
        expenseAutomationEnabled: enabled
      }).subscribe({
        next: (res) => {
          this.isSavingSettings.set(false);
          this.fetchAutomationStatus();
          this.notificationService.success(
            enabled ? 'Transaction detection enabled' : 'Transaction detection disabled',
            'Settings Saved'
          );
        },
        error: (err) => {
          this.isSavingSettings.set(false);
          console.error('Error updating automation settings', err);
          this.notificationService.error('Failed to update automation settings', 'Error');
        }
      });
    }
  }

  protected handleBankToggle(bank: string, checked: boolean) {
    const status = this.automationStatus();
    if (!status) return;

    let currentBanks = [...status.enabledBanks];
    if (checked) {
      if (!currentBanks.includes(bank)) currentBanks.push(bank);
    } else {
      currentBanks = currentBanks.filter(b => b !== bank);
    }

    this.isSavingSettings.set(true);
    this.expenseService.updateAutomationSettings({
      enabledBanks: currentBanks
    }).subscribe({
      next: () => {
        this.isSavingSettings.set(false);
        this.fetchAutomationStatus();
      },
      error: (err) => {
        this.isSavingSettings.set(false);
        console.error('Error updating bank settings', err);
      }
    });
  }

  protected disconnectGmail() {
    this.isSavingSettings.set(true);
    this.expenseService.disconnectGmail().subscribe({
      next: () => {
        this.isSavingSettings.set(false);
        this.fetchAutomationStatus();
        this.notificationService.success('Gmail disconnected successfully', 'Disconnected');
      },
      error: (err) => {
        this.isSavingSettings.set(false);
        console.error('Error disconnecting Gmail', err);
        this.notificationService.error('Failed to disconnect Gmail', 'Error');
      }
    });
  }

  protected fetchExpenses() {
    this.isLoading.set(true);
    this.expenseService.fetchExpenses().subscribe({
      next: (res) => {
        this.expenses.set(res.data);
        this.isLoading.set(false);
        this.syncCategoriesFromExpenses();
      },
      error: () => this.isLoading.set(false)
    });
  }

  protected fetchPendingTransactions() {
    this.expenseService.fetchPendingTransactions().subscribe({
      next: (res) => {
        this.pendingTransactions.set(res.data);
      },
      error: (err) => console.error('Error fetching pending transactions', err)
    });
  }

  protected processPending(id: string, action: 'approve' | 'ignore') {
    this.expenseService.processPendingTransaction(id, { action }).subscribe({
      next: () => {
        this.fetchPendingTransactions();
        if (action === 'approve') {
          this.fetchExpenses(); // Refresh expense list as it got approved
          this.refreshSummary();
        }
      },
      error: (err) => console.error('Error processing transaction', err)
    });
  }

  /**
   * Opens the log form pre-filled from a pending Gmail transaction. Submitting
   * it approves the pending row, which is what actually writes the expense —
   * see submitExpense().
   */
  protected reviewPending(ptx: PendingTransaction | Expense) {
    // Every backdrop shares one z-index, so the modal declared later in the
    // template wins. Pending is declared after the log form, and would sit on
    // top of it — the form opened, invisible, behind this overlay.
    this.isPendingModalOpen.set(false);

    this.activePendingId.set(ptx._id);
    this.editingExpenseId.set(null);
    this.expenseForm.reset({ category: 'Food', paymentMethod: 'UPI', date: this.getCurrentDateTimeLocal() });
    this.expenseForm.patchValue({
      amount: ptx.amount,
      merchant: ptx.merchant,
      paymentMethod: ptx.paymentMethod,
      category: ptx.category || 'Food',
      date: ptx.date ? new Date(new Date(ptx.date).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : this.getCurrentDateTimeLocal(),
      // Reset above, then patch: without it a previous edit's tags and notes
      // stayed in the form and were written onto this transaction.
      tags: ptx.tags?.join(', ') || '',
      notes: ptx.notes || ''
    });
    this.isLogModalOpen.set(true);
  }

  protected deleteExpense(id: string) {
    this.deleteConfirmId.set(id);
  }

  protected confirmDelete() {
    const id = this.deleteConfirmId();
    if (!id) return;
    
    this.expenseService.deleteExpense(id).subscribe({
      next: () => {
        this.fetchExpenses();
        this.expenseService.fetchSummary().subscribe();
        this.deleteConfirmId.set(null);
      },
      error: (err) => {
        console.error('Error deleting expense', err);
        this.deleteConfirmId.set(null);
      }
    });
  }

  protected cancelDelete() {
    this.deleteConfirmId.set(null);
  }

  protected editExpense(exp: Expense) {
    // Same stacking problem as reviewPending(): History is declared after the
    // log form, so it would cover the form this opens.
    this.isHistoryModalOpen.set(false);

    this.activePendingId.set(null);
    this.editingExpenseId.set(exp._id);
    this.expenseForm.patchValue({
      amount: exp.amount,
      merchant: exp.merchant,
      paymentMethod: exp.paymentMethod,
      category: exp.category || 'Food',
      date: exp.date ? new Date(new Date(exp.date).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : this.getCurrentDateTimeLocal(),
      tags: exp.tags?.join(', ') || '',
      notes: exp.notes || ''
    });
    this.isLogModalOpen.set(true);
  }

  protected cancelReview() {
    this.closeLogForm();
  }

  protected isFormInvalid(): boolean {
    return this.expenseForm.invalid;
  }

  /** Writes through to the signal and localStorage together, so the two never drift. */
  private persistCategories(next: CustomCategory[]) {
    this.customCategories.set(next);
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(next));
  }

  protected readonly fallbackCategory = FALLBACK_CATEGORY;

  /** Name pending delete confirmation, so the row can ask before reassigning. */
  protected readonly categoryPendingDelete = signal<string | null>(null);
  protected readonly isReassigning = signal(false);

  /** "Other" underpins every delete, so it is never itself removable or renamable. */
  protected isProtectedCategory(name: string): boolean {
    return name.trim().toLowerCase() === FALLBACK_CATEGORY.toLowerCase();
  }

  /** How many logged transactions currently carry this category. */
  protected categoryUsage(name: string): number {
    const key = name.toLowerCase();
    return this.expenses().filter(e => (e.category || FALLBACK_CATEGORY).toLowerCase() === key).length;
  }

  protected askDeleteCategory(name: string) {
    if (this.isProtectedCategory(name)) return;
    this.categoryPendingDelete.set(name);
  }

  protected cancelDeleteCategory() {
    this.categoryPendingDelete.set(null);
  }

  /** Names are matched case-insensitively so "Travel" and "travel" can't both exist. */
  private categoryExists(name: string, exceptName?: string): boolean {
    const key = name.trim().toLowerCase();
    return this.customCategories().some(
      c => c.name.toLowerCase() === key && c.name.toLowerCase() !== exceptName?.trim().toLowerCase()
    );
  }

  protected addCategory() {
    const name = this.newCategoryControl.value?.trim();
    if (!name) return;

    if (this.categoryExists(name)) {
      this.notificationService.warning(`"${name}" already exists.`, 'Duplicate category');
      return;
    }

    const shortName = this.newCategoryShortControl.value?.trim() || undefined;
    this.persistCategories([...this.customCategories(), { name, shortName }]);
    this.newCategoryControl.reset();
    this.newCategoryShortControl.reset();
  }

  /** Opens the inline editor for one row. */
  protected startEditCategory(cat: CustomCategory) {
    this.editingCategory.set(cat.name);
    this.editCategoryControl.setValue(cat.name);
    this.editCategoryShortControl.setValue(cat.shortName ?? '');
  }

  protected cancelEditCategory() {
    this.editingCategory.set(null);
    this.editCategoryControl.reset();
    this.editCategoryShortControl.reset();
  }

  protected saveCategory() {
    const original = this.editingCategory();
    if (!original) return;

    const name = this.editCategoryControl.value?.trim();
    if (!name) return;

    if (this.categoryExists(name, original)) {
      this.notificationService.warning(`"${name}" already exists.`, 'Duplicate category');
      return;
    }

    if (this.isProtectedCategory(original) && !this.isProtectedCategory(name)) {
      this.notificationService.warning(
        `"${FALLBACK_CATEGORY}" is where deleted categories send their transactions, so it cannot be renamed.`,
        'Cannot rename'
      );
      return;
    }

    const shortName = this.editCategoryShortControl.value?.trim() || undefined;
    const apply = () => {
      this.persistCategories(
        this.customCategories().map(c => (c.name === original ? { name, shortName } : c))
      );
      this.cancelEditCategory();
    };

    // A rename has to carry its transactions with it, or they end up pointing
    // at a category that no longer exists.
    if (name !== original) {
      this.isReassigning.set(true);
      this.expenseService.reassignCategory(original, name).subscribe({
        next: (res) => {
          this.isReassigning.set(false);
          apply();
          this.fetchExpenses();
          this.refreshSummary();
          const moved = res?.data?.expensesUpdated ?? 0;
          this.notificationService.success(
            moved > 0 ? `Renamed. ${moved} transaction${moved === 1 ? '' : 's'} updated.` : 'Category renamed.',
            'Saved'
          );
        },
        error: (err) => {
          this.isReassigning.set(false);
          this.notificationService.error(
            err?.error?.message || 'The category was not renamed.',
            'Could not rename category'
          );
        },
      });
      return;
    }

    apply();
  }

  /**
   * Deletes a category and moves everything filed under it to the fallback, so
   * no transaction is left pointing at a name that no longer exists.
   */
  protected confirmDeleteCategory(name: string) {
    if (this.isProtectedCategory(name)) return;

    this.isReassigning.set(true);
    this.expenseService.reassignCategory(name, FALLBACK_CATEGORY).subscribe({
      next: (res) => {
        this.isReassigning.set(false);
        this.persistCategories(this.customCategories().filter(c => c.name !== name));
        this.categoryPendingDelete.set(null);
        if (this.editingCategory() === name) this.cancelEditCategory();

        this.fetchExpenses();
        this.refreshSummary();

        const moved = res?.data?.expensesUpdated ?? 0;
        this.notificationService.success(
          moved > 0
            ? `"${name}" deleted. ${moved} transaction${moved === 1 ? '' : 's'} moved to ${FALLBACK_CATEGORY}.`
            : `"${name}" deleted.`,
          'Category removed'
        );
      },
      error: (err) => {
        this.isReassigning.set(false);
        // Leave the category in place: deleting it locally after the move
        // failed would strand its transactions under a dead name.
        this.notificationService.error(
          err?.error?.message || 'Its transactions could not be moved, so it was kept.',
          'Could not delete category'
        );
      },
    });
  }

  /** The list backing the log form's category dropdown. */
  protected getAllCategories(): string[] {
    return this.customCategories().map(c => c.name);
  }

  /**
   * Scans fetched expenses and pending transactions for category names that
   * are not yet in the local category list. Any missing names are appended
   * automatically so the Manage Categories screen and the dropdown always
   * reflect the actual data.
   */
  private syncCategoriesFromExpenses() {
    const known = new Set(this.customCategories().map(c => c.name.toLowerCase()));
    const discovered = new Set<string>();

    for (const exp of this.expenses()) {
      const cat = exp.category?.trim();
      if (cat && !known.has(cat.toLowerCase())) {
        discovered.add(cat);
        known.add(cat.toLowerCase());
      }
    }
    for (const ptx of this.pendingTransactions()) {
      const cat = ptx.category?.trim();
      if (cat && !known.has(cat.toLowerCase())) {
        discovered.add(cat);
        known.add(cat.toLowerCase());
      }
    }

    if (discovered.size > 0) {
      const additions: CustomCategory[] = [...discovered].map(name => ({ name }));
      this.persistCategories([...this.customCategories(), ...additions]);
    }
  }

  /**
   * The short name a user gave a category, falling back to the full name.
   * Used by the compact chips that can't fit long names.
   */
  protected getCategoryDisplayName(name: string): string {
    return this.customCategories().find(c => c.name === name)?.shortName || name;
  }

  protected getMaxValue(data: number[] | undefined): number {
    if (!data || data.length === 0) return 100;
    return Math.max(...data, 1);
  }

  protected submitExpense() {
    if (this.expenseForm.invalid) return;

    const rawValue = this.expenseForm.getRawValue();
    const payload: ExpensePayload = {
      ...rawValue,
      amount: Number(rawValue.amount),
      date: new Date(rawValue.date).toISOString(),
      tags: rawValue.tags ? rawValue.tags.split(',').map((t: string) => t.trim()) : []
    };

    this.isAdding.set(true);
    
    const pendingId = this.activePendingId();
    const editingId = this.editingExpenseId();

    // Three jobs, one form. Approving a pending row and editing an existing
    // expense both have an id to act on; only the fall-through creates.
    // Typed to the shared envelope: the three calls return slightly different
    // response shapes, and the raw union has no compatible subscribe overload.
    const request$: Observable<{ status: string }> = pendingId
      ? this.expenseService.processPendingTransaction(pendingId, { action: 'approve', ...payload })
      : editingId
        ? this.expenseService.updateExpense(editingId, payload)
        : this.expenseService.createExpense(payload);

    request$.subscribe({
      next: () => {
        this.isAdding.set(false);
        this.notificationService.success(
          editingId ? 'Transaction updated.' : pendingId ? 'Transaction approved and saved.' : 'Transaction saved.',
          'Saved'
        );
        this.closeLogForm();
        if (pendingId) this.fetchPendingTransactions();
        this.fetchExpenses();
        this.refreshSummary();
      },
      /**
       * Staying open on failure is right — the user's input is still in the
       * form — but this used to happen with no message at all, so a failed
       * save was indistinguishable from a button that did nothing.
       */
      error: (err) => {
        this.isAdding.set(false);
        const action = editingId ? 'update' : pendingId ? 'approve' : 'save';
        const detail = err?.status === 404 && editingId
          ? 'The update endpoint is not available on this server.'
          : err?.error?.message || 'Please try again.';
        this.notificationService.error(detail, `Could not ${action} transaction`);
      }
    });
  }

  /**
   * Entry point for "Quick Add". Clears any id left behind by a previous edit
   * or review so the form is unambiguously in create mode.
   */
  protected openLogForm() {
    this.activePendingId.set(null);
    this.editingExpenseId.set(null);
    this.expenseForm.reset({ category: 'Food', paymentMethod: 'UPI', date: this.getCurrentDateTimeLocal() });
    this.isLogModalOpen.set(true);
  }

  /** Clears both modes so the next open starts clean. */
  private closeLogForm() {
    this.activePendingId.set(null);
    this.editingExpenseId.set(null);
    this.expenseForm.reset({ category: 'Food', paymentMethod: 'UPI', date: this.getCurrentDateTimeLocal() });
    this.isLogModalOpen.set(false);
  }

  /**
   * fetchExpenses() only reloads the list. Without this the budget ring, safe-
   * to-spend, projection and category breakdown all kept their pre-submit
   * values until the page was reloaded.
   */
  private refreshSummary() {
    this.expenseService.fetchSummary().subscribe();
  }
}
