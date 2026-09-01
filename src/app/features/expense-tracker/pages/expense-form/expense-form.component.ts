import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  ExpenseService,
  ExpensePayload,
  CustomCategory,
  Expense,
  PendingTransaction
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, BottomNavComponent],
  templateUrl: './expense-form.component.html',
  styleUrl: './expense-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly mode = signal<'add' | 'edit' | 'review'>('add');
  protected readonly targetId = signal<string | null>(null);
  protected readonly categories = signal<CustomCategory[]>([]);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly isLoadingData = signal<boolean>(false);
  protected readonly isDeleting = signal<boolean>(false);
  protected readonly showDeleteConfirm = signal<boolean>(false);

  // ── Custom Dropdowns State ──
  protected readonly isCategoryDropdownOpen = signal<boolean>(false);
  protected readonly isPaymentMethodDropdownOpen = signal<boolean>(false);
  protected readonly paymentMethods = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Other'];

  // ── Interactive Tag Chips State ──
  protected readonly tagsList = signal<string[]>([]);
  protected readonly tagInput = signal<string>('');

  protected readonly expenseForm = this.fb.nonNullable.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    title: ['', [Validators.required, Validators.maxLength(100)]],
    category: ['Other', Validators.required],
    notes: [''],
    date: [this.getCurrentDateTimeLocal(), Validators.required],
    merchant: [''],
    paymentMethod: ['UPI', Validators.required],
  });

  // ── Custom Dropdown Methods ──
  protected toggleCategoryDropdown() {
    this.isCategoryDropdownOpen.update((v) => !v);
    this.isPaymentMethodDropdownOpen.set(false);
  }

  protected selectCategory(catName: string) {
    this.expenseForm.patchValue({ category: catName });
    this.isCategoryDropdownOpen.set(false);
  }

  protected togglePaymentMethodDropdown() {
    this.isPaymentMethodDropdownOpen.update((v) => !v);
    this.isCategoryDropdownOpen.set(false);
  }

  protected selectPaymentMethod(method: string) {
    this.expenseForm.patchValue({ paymentMethod: method });
    this.isPaymentMethodDropdownOpen.set(false);
  }

  protected closeAllDropdowns() {
    this.isCategoryDropdownOpen.set(false);
    this.isPaymentMethodDropdownOpen.set(false);
  }

  protected getCategoryIcon(category: string): string {
    const cat = (category || '').toLowerCase();
    if (cat.includes('food') || cat.includes('dining')) return 'restaurant';
    if (cat.includes('transport') || cat.includes('travel') || cat.includes('cab') || cat.includes('car')) return 'directions_car';
    if (cat.includes('shop') || cat.includes('mall') || cat.includes('amazon') || cat.includes('flipkart')) return 'local_mall';
    if (cat.includes('util') || cat.includes('bill') || cat.includes('recharge') || cat.includes('electric')) return 'bolt';
    if (cat.includes('entertain') || cat.includes('movie') || cat.includes('cinema')) return 'movie';
    if (cat.includes('health') || cat.includes('med') || cat.includes('doc')) return 'medical_services';
    if (cat.includes('rent') || cat.includes('home') || cat.includes('house')) return 'home';
    if (cat.includes('invest') || cat.includes('stock') || cat.includes('gold')) return 'trending_up';
    if (cat.includes('grocer') || cat.includes('supermarket')) return 'shopping_basket';
    if (cat.includes('edu') || cat.includes('course') || cat.includes('book')) return 'school';
    return 'category';
  }

  protected getPaymentMethodIcon(method: string): string {
    switch (method) {
      case 'UPI': return 'qr_code_2';
      case 'Credit Card':
      case 'Debit Card': return 'credit_card';
      case 'Net Banking': return 'account_balance';
      case 'Cash': return 'payments';
      default: return 'wallet';
    }
  }

  protected readonly pageTitle = computed(() => {
    switch (this.mode()) {
      case 'edit': return 'Edit Transaction';
      case 'review': return 'Review Pending Transaction';
      default: return 'Log New Expense';
    }
  });

  protected readonly pageSubtitle = computed(() => {
    switch (this.mode()) {
      case 'edit': return 'Update transaction details';
      case 'review': return 'Verify Gmail auto-logged details before saving';
      default: return 'Record an expense entry';
    }
  });

  protected readonly submitButtonText = computed(() => {
    switch (this.mode()) {
      case 'edit': return 'Update Transaction';
      case 'review': return 'Approve & Save';
      default: return 'Save Expense';
    }
  });

  ngOnInit() {
    this.fetchCategories();

    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      const url = this.router.url;

      if (url.includes('/pending/') && id) {
        this.mode.set('review');
        this.targetId.set(id);
        this.loadPendingData(id);
      } else if (url.includes('/edit/') && id) {
        this.mode.set('edit');
        this.targetId.set(id);
        this.loadExpenseData(id);
      } else {
        this.mode.set('add');
        this.targetId.set(null);
        this.tagsList.set([]);
      }
    });
  }

  // ── Tag Chip Management ──
  protected addTag(value?: string) {
    const rawVal = (value !== undefined ? value : this.tagInput()).trim();
    if (!rawVal) return;

    // Split by comma or whitespace to allow fast multi-entry
    const parts = rawVal.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    const current = this.tagsList();
    const updated = [...current];

    for (const p of parts) {
      if (!updated.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
        updated.push(p);
      }
    }

    this.tagsList.set(updated);
    this.tagInput.set('');
  }

  protected removeTag(index: number) {
    this.tagsList.update((list) => list.filter((_, i) => i !== index));
  }

  protected onTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      event.preventDefault();
      this.addTag();
    } else if (event.key === 'Backspace' && !this.tagInput() && this.tagsList().length > 0) {
      this.removeTag(this.tagsList().length - 1);
    }
  }

  private getCurrentDateTimeLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  private fetchCategories() {
    this.expenseService.fetchCategories().subscribe({
      next: (res) => {
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          this.categories.set(res.data);
          // If in add mode, ensure selected category exists in the list
          if (this.mode() === 'add') {
            const currentCat = this.expenseForm.get('category')?.value;
            const exists = res.data.some((c) => c.name.toLowerCase() === (currentCat || '').toLowerCase());
            if (!exists) {
              this.expenseForm.patchValue({ category: res.data[0].name });
            }
          }
        }
      },
      error: (err) => console.error('Failed to load categories', err),
    });
  }

  private loadExpenseData(id: string) {
    this.isLoadingData.set(true);
    this.expenseService.fetchExpenseById(id).subscribe({
      next: (res) => {
        this.isLoadingData.set(false);
        const exp = res.data;
        if (exp) {
          const dateStr = exp.date ? new Date(exp.date).toISOString().slice(0, 16) : this.getCurrentDateTimeLocal();
          this.expenseForm.patchValue({
            amount: exp.amount,
            title: exp.title || exp.merchant || '',
            category: exp.category || 'Other',
            notes: exp.notes || '',
            date: dateStr,
            merchant: exp.merchant || '',
            paymentMethod: exp.paymentMethod || 'UPI',
          });
          this.tagsList.set(exp.tags || []);
        }
      },
      error: (err) => {
        this.isLoadingData.set(false);
        this.notificationService.error('Failed to load expense details', 'Error');
        this.goBack();
      },
    });
  }

  private loadPendingData(id: string) {
    this.isLoadingData.set(true);
    this.expenseService.fetchPendingTransactions().subscribe({
      next: (res) => {
        this.isLoadingData.set(false);
        const ptx = (res.data || []).find((p) => p._id === id);
        if (ptx) {
          const dateStr = ptx.date ? new Date(ptx.date).toISOString().slice(0, 16) : this.getCurrentDateTimeLocal();
          this.expenseForm.patchValue({
            amount: ptx.amount,
            title: ptx.title || ptx.merchant || '',
            category: ptx.category || 'Other',
            notes: ptx.notes || '',
            date: dateStr,
            merchant: ptx.merchant || '',
            paymentMethod: ptx.paymentMethod || 'UPI',
          });
          this.tagsList.set(ptx.tags || []);
        }
      },
      error: (err) => {
        this.isLoadingData.set(false);
        this.notificationService.error('Failed to load pending transaction', 'Error');
        this.goBack();
      },
    });
  }

  protected goBack() {
    this.location.back();
  }

  protected submitForm() {
    if (this.expenseForm.invalid) return;

    // Flush any pending tag in input
    if (this.tagInput().trim()) {
      this.addTag();
    }

    const raw = this.expenseForm.getRawValue();
    const titleVal = raw.title.trim();
    const merchantVal = (raw.merchant || '').trim() || titleVal;

    const payload: ExpensePayload = {
      amount: Number(raw.amount),
      title: titleVal,
      merchant: merchantVal,
      category: raw.category.trim(),
      paymentMethod: raw.paymentMethod,
      date: new Date(raw.date).toISOString(),
      tags: this.tagsList(),
      notes: raw.notes ? raw.notes.trim() : '',
    };

    this.isSubmitting.set(true);
    const m = this.mode();
    const id = this.targetId();

    if (m === 'edit' && id) {
      this.expenseService.updateExpense(id, payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.notificationService.success('Transaction updated successfully.', 'Updated');
          this.goBack();
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to update transaction',
            'Error'
          );
        },
      });
    } else if (m === 'review' && id) {
      this.expenseService.processPendingTransaction(id, { action: 'approve', ...payload }).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.notificationService.success('Pending transaction approved and saved.', 'Saved');
          this.router.navigate(['/expenses/pending']);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to approve transaction',
            'Error'
          );
        },
      });
    } else {
      this.expenseService.createExpense(payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.notificationService.success('Expense saved successfully.', 'Saved');
          this.router.navigate(['/expenses']);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to create expense',
            'Error'
          );
        },
      });
    }
  }

  protected deleteCurrentExpense() {
    const id = this.targetId();
    if (!id || this.mode() !== 'edit') return;

    this.isDeleting.set(true);
    this.expenseService.deleteExpense(id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.notificationService.success('Transaction deleted.', 'Deleted');
        this.router.navigate(['/expenses/history']);
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to delete transaction',
          'Error'
        );
      },
    });
  }
}
