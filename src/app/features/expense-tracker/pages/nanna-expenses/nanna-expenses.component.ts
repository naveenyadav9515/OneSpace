import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  NannaExpenseService,
  NannaExpense,
  NannaMonthGroup,
  CreateNannaExpensePayload,
} from '@core/services/nanna-expense.service';

@Component({
  selector: 'app-nanna-expenses',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, BottomNavComponent],
  templateUrl: './nanna-expenses.component.html',
  styleUrl: './nanna-expenses.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NannaExpensesComponent implements OnInit {
  readonly svc = inject(NannaExpenseService);

  // ── Expense modal state ──
  readonly isModalOpen = signal(false);

  // ── Form fields (add/edit expense popup) ──
  formAmount = '';
  formReason = '';
  formDate = this.todayIso();
  formNotes = '';
  formBudget = '';    // budget for the month of the selected date
  formError = '';

  // ── Editing an expense entry ──
  editingId: string | null = null;

  // ── Delete confirmation ──
  readonly deletingId = signal<string | null>(null);

  // ── Budget edit on card ──
  readonly editingBudgetKey = signal<string | null>(null); // "YYYY-MM"
  editBudgetValue = '';
  budgetEditError = '';

  ngOnInit(): void {
    this.svc.fetchAll();
  }

  // ──────────────────────────────────────
  //  EXPENSE MODAL
  // ──────────────────────────────────────

  openAddModal(): void {
    this.editingId = null;
    this.formAmount = '';
    this.formReason = '';
    this.formDate = this.todayIso();
    this.formNotes = '';
    this.formBudget = String(this.svc.getBudgetForDate(this.formDate) || '');
    this.formError = '';
    this.isModalOpen.set(true);
  }

  openEditModal(exp: NannaExpense): void {
    this.editingId = exp._id;
    this.formAmount = String(exp.amount);
    this.formReason = exp.reason;
    this.formDate = this.toInputDate(exp.date);
    this.formNotes = exp.notes || '';
    this.formBudget = String(this.svc.getBudgetForDate(exp.date) || '');
    this.formError = '';
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.formError = '';
  }

  /** Called whenever the date picker changes — refresh the budget field for the new month */
  onFormDateChange(): void {
    const existingBudget = this.svc.getBudgetForDate(this.formDate);
    // Only auto-fill if the user hasn't typed a custom value
    if (!this.formBudget || Number(this.formBudget) === 0) {
      this.formBudget = existingBudget > 0 ? String(existingBudget) : '';
    }
  }

  async submitForm(): Promise<void> {
    const amount = parseFloat(this.formAmount);
    if (!amount || amount <= 0) {
      this.formError = 'Please enter a valid amount greater than 0.';
      return;
    }
    if (!this.formReason.trim()) {
      this.formError = 'Please enter a reason for the expense.';
      return;
    }

    const payload: CreateNannaExpensePayload = {
      amount,
      reason: this.formReason.trim(),
      date: this.formDate || this.todayIso(),
      notes: this.formNotes.trim() || undefined,
    };

    // Save budget first (if provided)
    if (this.formBudget && parseFloat(this.formBudget) >= 0) {
      const dateForBudget = new Date(payload.date!);
      const year = dateForBudget.getFullYear();
      const month = dateForBudget.getMonth() + 1; // 1-indexed
      await this.svc.upsertBudget(year, month, parseFloat(this.formBudget));
    }

    // Save expense
    let success: boolean;
    if (this.editingId) {
      const result = await this.svc.updateExpense(this.editingId, payload);
      success = !!result;
    } else {
      const result = await this.svc.createExpense(payload);
      success = !!result;
    }

    if (success) {
      this.closeModal();
    } else {
      this.formError = this.svc.error() || 'An error occurred. Please try again.';
    }
  }

  // ──────────────────────────────────────
  //  DELETE
  // ──────────────────────────────────────

  confirmDelete(id: string): void {
    this.deletingId.set(id);
  }

  cancelDelete(): void {
    this.deletingId.set(null);
  }

  async executeDelete(id: string): Promise<void> {
    await this.svc.deleteExpense(id);
    this.deletingId.set(null);
  }

  // ──────────────────────────────────────
  //  INLINE CARD BUDGET EDIT
  // ──────────────────────────────────────

  openCardBudgetEdit(group: NannaMonthGroup): void {
    this.editingBudgetKey.set(group.key);
    this.editBudgetValue = group.budget > 0 ? String(group.budget) : '';
    this.budgetEditError = '';
  }

  closeCardBudgetEdit(): void {
    this.editingBudgetKey.set(null);
    this.budgetEditError = '';
  }

  async saveCardBudget(group: NannaMonthGroup): Promise<void> {
    const budget = parseFloat(this.editBudgetValue);
    if (isNaN(budget) || budget < 0) {
      this.budgetEditError = 'Please enter a valid budget amount.';
      return;
    }
    // month is 0-indexed in the group, API expects 1-indexed
    const result = await this.svc.upsertBudget(group.year, group.month + 1, budget);
    if (result !== null) {
      this.closeCardBudgetEdit();
    } else {
      this.budgetEditError = this.svc.error() || 'Failed to save budget.';
    }
  }

  // ──────────────────────────────────────
  //  UTILITIES
  // ──────────────────────────────────────

  budgetUsedPct(group: NannaMonthGroup): number {
    if (!group.budget || group.budget === 0) return 0;
    return Math.min(Math.round((group.total / group.budget) * 100), 100);
  }

  isOverBudget(group: NannaMonthGroup): boolean {
    return group.budget > 0 && group.total > group.budget;
  }

  private todayIso(): string {
    const now = new Date();
    return now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  }

  private toInputDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toISOString().slice(0, 16);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
