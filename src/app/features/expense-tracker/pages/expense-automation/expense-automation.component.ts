import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  ExpenseService,
  AutomationStatus
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-expense-automation',
  standalone: true,
  imports: [CommonModule, RouterLink, BottomNavComponent],
  templateUrl: './expense-automation.component.html',
  styleUrl: './expense-automation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseAutomationComponent implements OnInit, OnDestroy {
  private readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  protected readonly automationStatus = signal<AutomationStatus | null>(null);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly isSaving = signal<boolean>(false);
  protected readonly isSyncing = signal<boolean>(false);
  protected readonly syncCooldownSeconds = signal<number>(0);

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly isSyncDisabled = computed(
    () => this.isSyncing() || this.syncCooldownSeconds() > 0
  );

  ngOnInit() {
    this.fetchAutomationStatus();

    // Handle OAuth redirect code if redirected back from Google
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      if (code) {
        this.completeGmailConnection(code);
      }
    });
  }

  ngOnDestroy() {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  protected fetchAutomationStatus() {
    this.isLoading.set(true);
    this.expenseService.fetchAutomationStatus().subscribe({
      next: (res) => {
        this.automationStatus.set(res.data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load automation settings', 'Error');
      },
    });
  }

  protected handleAutomationToggle(enabled: boolean) {
    this.isSaving.set(true);
    this.expenseService
      .updateAutomationSettings({ expenseAutomationEnabled: enabled })
      .subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.automationStatus.set(res.data);
          this.notificationService.success(
            enabled ? 'Automatic transaction detection enabled.' : 'Detection disabled.',
            'Saved'
          );
        },
        error: (err) => {
          this.isSaving.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to update setting',
            'Error'
          );
        },
      });
  }

  protected handleBankToggle(bank: string, enabled: boolean) {
    const current = this.automationStatus()?.enabledBanks || [];
    const next = enabled
      ? Array.from(new Set([...current, bank]))
      : current.filter((b) => b !== bank);

    this.isSaving.set(true);
    this.expenseService.updateAutomationSettings({ enabledBanks: next }).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.automationStatus.set(res.data);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to update bank selection',
          'Error'
        );
      },
    });
  }

  protected connectGmail() {
    const redirectUri = `${window.location.origin}/expenses/automation`;
    this.expenseService.getGmailConnectionUrl(redirectUri).subscribe({
      next: (res) => {
        if (res.data?.url) {
          window.location.href = res.data.url;
        }
      },
      error: (err) => {
        this.notificationService.error(
          err?.error?.message || 'Could not initiate Google login',
          'Error'
        );
      },
    });
  }

  protected completeGmailConnection(code: string) {
    const redirectUri = `${window.location.origin}/expenses/automation`;
    this.isSaving.set(true);
    this.expenseService.completeGmailConnection(code, redirectUri).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.fetchAutomationStatus();
        this.notificationService.success('Gmail successfully connected for transaction alerts.', 'Connected');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to complete Gmail connection',
          'Connection Failed'
        );
      },
    });
  }

  protected disconnectGmail() {
    this.isSaving.set(true);
    this.expenseService.disconnectGmail().subscribe({
      next: () => {
        this.isSaving.set(false);
        this.fetchAutomationStatus();
        this.notificationService.info('Gmail disconnected.', 'Disconnected');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to disconnect Gmail',
          'Error'
        );
      },
    });
  }

  protected syncGmailManually() {
    if (this.isSyncDisabled()) return;

    this.isSyncing.set(true);
    this.expenseService.syncExpenses().subscribe({
      next: (res) => {
        this.isSyncing.set(false);
        if (res.data?.ok) {
          this.notificationService.success(res.message || 'Gmail sync completed.', 'Synced');
        } else {
          this.startSyncCooldown(res.data?.retryAfterSeconds || 300);
          this.notificationService.warning(
            res.data?.error || 'Rate limit active. Please wait.',
            'Rate Limited'
          );
        }
      },
      error: (err) => {
        this.isSyncing.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to sync Gmail transactions',
          'Sync Failed'
        );
      },
    });
  }

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
}
