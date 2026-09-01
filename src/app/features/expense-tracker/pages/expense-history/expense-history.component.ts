import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  Expense,
  ExpenseService,
  CustomCategory
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

@Component({
  selector: 'app-expense-history',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, BottomNavComponent],
  templateUrl: './expense-history.component.html',
  styleUrl: './expense-history.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseHistoryComponent implements OnInit {
  private readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly expenses = signal<Expense[]>([]);
  protected readonly categories = signal<CustomCategory[]>([]);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly selectedCategory = signal<string>('all');
  protected readonly deleteConfirmId = signal<string | null>(null);

  protected readonly searchControl = new FormControl('');
  protected readonly searchQuery = signal<string>('');

  constructor() {
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchQuery.set((value || '').trim().toLowerCase());
    });
  }

  ngOnInit() {
    this.fetchExpenses();
    this.fetchCategories();
  }

  protected fetchExpenses() {
    this.isLoading.set(true);
    this.expenseService.fetchExpenses().subscribe({
      next: (res) => {
        this.expenses.set(res.data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load transaction history', 'Error');
      },
    });
  }

  protected fetchCategories() {
    this.expenseService.fetchCategories().subscribe({
      next: (res) => {
        if (res.data && Array.isArray(res.data)) {
          this.categories.set(res.data);
        }
      },
      error: (err) => console.error('Failed to load categories', err),
    });
  }

  protected readonly filteredExpenses = computed(() => {
    let list = this.expenses();
    const cat = this.selectedCategory();
    const query = this.searchQuery();

    if (cat !== 'all') {
      const catLower = cat.toLowerCase();
      list = list.filter((e) => (e.category || 'other').toLowerCase() === catLower);
    }

    if (query) {
      list = list.filter((e) => {
        const titleMatch = (e.title || '').toLowerCase().includes(query);
        const merchantMatch = (e.merchant || '').toLowerCase().includes(query);
        const notesMatch = (e.notes || '').toLowerCase().includes(query);
        const tagsMatch = (e.tags || []).some((t) => t.toLowerCase().includes(query));
        const categoryMatch = (e.category || '').toLowerCase().includes(query);
        const methodMatch = (e.paymentMethod || '').toLowerCase().includes(query);
        return titleMatch || merchantMatch || notesMatch || tagsMatch || categoryMatch || methodMatch;
      });
    }

    return list;
  });

  protected readonly totalAmount = computed(() => {
    return this.filteredExpenses().reduce((sum, e) => sum + (e.amount || 0), 0);
  });

  protected setCategoryFilter(categoryName: string) {
    this.selectedCategory.set(categoryName);
  }

  protected editExpense(id: string) {
    this.router.navigate(['/expenses/edit', id]);
  }

  protected promptDelete(id: string) {
    this.deleteConfirmId.set(id);
  }

  protected cancelDelete() {
    this.deleteConfirmId.set(null);
  }

  protected confirmDelete(id: string) {
    this.expenseService.deleteExpense(id).subscribe({
      next: () => {
        this.expenses.update((list) => list.filter((e) => e._id !== id));
        this.deleteConfirmId.set(null);
        this.notificationService.success('Transaction deleted.', 'Deleted');
      },
      error: (err) => {
        this.notificationService.error(
          err?.error?.message || 'Failed to delete transaction',
          'Error'
        );
      },
    });
  }
}
