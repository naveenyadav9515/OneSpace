import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { environment } from '@env/environment';

/**
 * Index of the "Log" tab. Panel order in the template is Log, History, Pending;
 * Log is the only one navigated to programmatically, when a transaction is sent
 * to the form for review or editing.
 */
const TAB_LOG = 0;

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
  private readonly expenseService = inject(ExpenseService);
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
  protected deleteConfirmId = signal<string | null>(null);
  protected isSyncing = signal(false);
  protected readonly canSimulateAutoLog = !environment.production && environment.featureFlags.enableExpenseSimulator;

  /** Index of the visible tab. Order must match the panels in the template. */
  protected readonly activeTab = signal(TAB_LOG);

  protected readonly tabs = computed<TabDefinition[]>(() => [
    { id: 'log', label: 'Log', icon: 'add_circle' },
    { id: 'history', label: 'History', icon: 'receipt_long' },
    {
      id: 'pending',
      label: 'Pending',
      icon: 'mark_email_unread',
      // Surfaces work waiting on the user without them opening the tab.
      badge: this.pendingTransactions().length,
    },
  ]);

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
    
    // Check for Google OAuth code
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      if (code) {
        this.completeGmailConnection(code);
      }
    });
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
        }
      },
      error: (err) => console.error('Error processing transaction', err)
    });
  }

  protected reviewPending(ptx: PendingTransaction | Expense) {
    // The form lives on the Log tab — surface it, or the tap appears to do nothing.
    this.activeTab.set(TAB_LOG);
    this.activePendingId.set(ptx._id);
    this.expenseForm.patchValue({
      amount: ptx.amount,
      merchant: ptx.merchant,
      paymentMethod: ptx.paymentMethod,
      category: ptx.category || 'Food',
      date: ptx.date ? new Date(new Date(ptx.date).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : this.getCurrentDateTimeLocal()
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    this.activeTab.set(TAB_LOG);
    this.activePendingId.set(null);
    this.expenseForm.patchValue({
      amount: exp.amount,
      merchant: exp.merchant,
      paymentMethod: exp.paymentMethod,
      category: exp.category || 'Food',
      date: exp.date ? new Date(new Date(exp.date).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : this.getCurrentDateTimeLocal(),
      tags: exp.tags?.join(', ') || '',
      notes: exp.notes || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected cancelReview() {
    this.activePendingId.set(null);
    this.expenseForm.reset({ category: 'Food', paymentMethod: 'UPI', date: this.getCurrentDateTimeLocal() });
  }

  protected simulateAutoLog() {
    this.expenseService.simulateAutoLog().subscribe({
      next: () => {
        this.fetchPendingTransactions();
      },
      error: (err) => console.error('Error simulating auto log', err)
    });
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
    if (pendingId) {
      this.expenseService.processPendingTransaction(pendingId, { action: 'approve', ...payload }).subscribe({
        next: () => {
          this.isAdding.set(false);
          this.activePendingId.set(null);
          this.expenseForm.reset({ category: 'Food', paymentMethod: 'UPI', date: this.getCurrentDateTimeLocal() });
          this.fetchPendingTransactions();
          this.fetchExpenses(); // Refresh list
        },
        error: () => this.isAdding.set(false)
      });
    } else {
      this.expenseService.createExpense(payload).subscribe({
        next: () => {
          this.isAdding.set(false);
          this.expenseForm.reset({ category: 'Food', paymentMethod: 'UPI', date: this.getCurrentDateTimeLocal() });
          this.fetchExpenses(); // Refresh list
        },
        error: () => this.isAdding.set(false)
      });
    }
  }
}
