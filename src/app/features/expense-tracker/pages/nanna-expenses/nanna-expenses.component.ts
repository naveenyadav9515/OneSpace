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

  // ── Modal state ──
  readonly isModalOpen = signal(false);

  // ── Form fields (for the "add" popup) ──
  formAmount = '';
  formReason = '';
  formDate = this.todayIso();
  formNotes = '';
  formError = '';

  // ── Edit mode ──
  editingId: string | null = null;

  // ── Delete confirmation ──
  readonly deletingId = signal<string | null>(null);

  ngOnInit(): void {
    this.svc.fetchExpenses();
  }

  // ── Modal helpers ──
  openAddModal(): void {
    this.editingId = null;
    this.formAmount = '';
    this.formReason = '';
    this.formDate = this.todayIso();
    this.formNotes = '';
    this.formError = '';
    this.isModalOpen.set(true);
  }

  openEditModal(exp: NannaExpense): void {
    this.editingId = exp._id;
    this.formAmount = String(exp.amount);
    this.formReason = exp.reason;
    this.formDate = this.toInputDate(exp.date);
    this.formNotes = exp.notes || '';
    this.formError = '';
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.formError = '';
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

  // ── Delete helpers ──
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

  // ── Date utilities ──
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
