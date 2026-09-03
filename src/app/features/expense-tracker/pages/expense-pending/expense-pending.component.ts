import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  ExpenseService,
  PendingTransaction
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-expense-pending',
  standalone: true,
  imports: [CommonModule, RouterLink, BottomNavComponent],
  templateUrl: './expense-pending.component.html',
  styleUrl: './expense-pending.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensePendingComponent implements OnInit, OnDestroy {
  private readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly pendingTransactions = signal<PendingTransaction[]>([]);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly isSyncing = signal<boolean>(false);
  protected readonly syncCooldownSeconds = signal<number>(0);
  protected readonly processingIds = signal<Set<string>>(new Set());

  // ── Merge State ──
  protected readonly isMergeMode = signal<boolean>(false);
  protected readonly primaryMergeId = signal<string | null>(null);
  protected readonly secondaryMergeIds = signal<Set<string>>(new Set());
  protected readonly isMerging = signal<boolean>(false);
  protected readonly showMergeConfirmModal = signal<boolean>(false);

  // Computeds for Merge
  protected readonly primaryTransaction = computed(() => {
    const pId = this.primaryMergeId();
    if (!pId) return null;
    return this.pendingTransactions().find(p => p._id === pId) || null;
  });

  protected readonly secondaryTransactions = computed(() => {
    const sIds = this.secondaryMergeIds();
    return this.pendingTransactions().filter(p => sIds.has(p._id));
  });

  protected readonly totalMergedAmount = computed(() => {
    const primary = this.primaryTransaction();
    const secondaries = this.secondaryTransactions();
    const primaryAmt = primary ? Number(primary.amount) || 0 : 0;
    const secondaryAmt = secondaries.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.round((primaryAmt + secondaryAmt) * 100) / 100;
  });

  protected readonly canExecuteMerge = computed(() => {
    return this.primaryMergeId() !== null && this.secondaryMergeIds().size > 0;
  });

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly isSyncDisabled = computed(
    () => this.isSyncing() || this.syncCooldownSeconds() > 0
  );

  ngOnInit() {
    this.fetchPendingTransactions();
  }

  ngOnDestroy() {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  protected fetchPendingTransactions() {
    this.isLoading.set(true);
    this.expenseService.fetchPendingTransactions().subscribe({
      next: (res) => {
        this.pendingTransactions.set(res.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load pending transactions', 'Error');
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
          this.fetchPendingTransactions();
          this.notificationService.success(res.message || 'Gmail sync completed.', 'Synced');
        } else {
          this.startSyncCooldown(res.data?.retryAfterSeconds || 300);
          this.notificationService.warning(
            res.data?.error || 'Google rate limit active. Please wait before syncing again.',
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

  protected quickApprove(ptx: PendingTransaction) {
    this.processingIds.update((s) => new Set(s).add(ptx._id));

    this.expenseService.processPendingTransaction(ptx._id, {
      action: 'approve',
      amount: ptx.amount,
      title: ptx.title || ptx.merchant,
      merchant: ptx.merchant,
      category: ptx.category || 'Other',
      paymentMethod: ptx.paymentMethod || 'UPI',
      date: new Date(ptx.date).toISOString(),
      tags: ptx.tags || [],
      notes: ptx.notes || '',
    }).subscribe({
      next: () => {
        this.pendingTransactions.update((list) => list.filter((p) => p._id !== ptx._id));
        this.processingIds.update((s) => {
          const next = new Set(s);
          next.delete(ptx._id);
          return next;
        });
        this.notificationService.success('Transaction approved and saved.', 'Approved');
      },
      error: (err) => {
        this.processingIds.update((s) => {
          const next = new Set(s);
          next.delete(ptx._id);
          return next;
        });
        this.notificationService.error(
          err?.error?.message || 'Failed to approve transaction',
          'Error'
        );
      },
    });
  }

  protected reviewInForm(id: string) {
    this.router.navigate(['/expenses/pending', id, 'review']);
  }

  protected ignoreTransaction(id: string) {
    this.processingIds.update((s) => new Set(s).add(id));

    this.expenseService.processPendingTransaction(id, { action: 'ignore' }).subscribe({
      next: () => {
        this.pendingTransactions.update((list) => list.filter((p) => p._id !== id));
        this.processingIds.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        this.notificationService.info('Transaction ignored.', 'Ignored');
      },
      error: (err) => {
        this.processingIds.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        this.notificationService.error(
          err?.error?.message || 'Failed to ignore transaction',
          'Error'
        );
      },
    });
  }

  // ── Merge Handlers ──
  protected toggleMergeMode(): void {
    const next = !this.isMergeMode();
    this.isMergeMode.set(next);
    if (!next) {
      this.cancelMerge();
    }
  }

  protected cancelMerge(): void {
    this.primaryMergeId.set(null);
    this.secondaryMergeIds.set(new Set());
    this.showMergeConfirmModal.set(false);
  }

  protected selectPrimary(id: string): void {
    if (this.primaryMergeId() === id) {
      this.primaryMergeId.set(null);
      return;
    }
    this.primaryMergeId.set(id);
    // If it was checked in secondary merge set, uncheck it
    this.secondaryMergeIds.update((set) => {
      if (set.has(id)) {
        const next = new Set(set);
        next.delete(id);
        return next;
      }
      return set;
    });
  }

  protected toggleSecondary(id: string): void {
    if (this.primaryMergeId() === id) return;

    this.secondaryMergeIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected openMergeConfirm(): void {
    if (!this.canExecuteMerge()) return;
    this.showMergeConfirmModal.set(true);
  }

  protected closeMergeConfirm(): void {
    this.showMergeConfirmModal.set(false);
  }

  protected executeMerge(): void {
    const primaryId = this.primaryMergeId();
    const mergeIds = Array.from(this.secondaryMergeIds());
    if (!primaryId || mergeIds.length === 0) return;

    this.isMerging.set(true);
    this.expenseService.mergePendingTransactions(primaryId, mergeIds).subscribe({
      next: (res) => {
        this.isMerging.set(false);
        this.showMergeConfirmModal.set(false);
        this.cancelMerge();
        this.isMergeMode.set(false);
        this.fetchPendingTransactions();
        this.notificationService.success(
          res.message || `Successfully merged ${mergeIds.length} transactions into primary.`,
          'Merged'
        );
      },
      error: (err) => {
        this.isMerging.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to merge transactions',
          'Merge Failed'
        );
      }
    });
  }
}
