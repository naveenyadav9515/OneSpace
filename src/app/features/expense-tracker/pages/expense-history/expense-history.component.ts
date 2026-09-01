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

  // ── Period Navigation & Granularity State ──
  protected readonly periodGranularity = signal<'daily' | 'weekly' | 'monthly' | 'yearly' | 'all'>('monthly');
  protected readonly selectedYear = signal<number>(new Date().getFullYear());
  protected readonly selectedMonth = signal<number>(new Date().getMonth()); // 0-indexed
  protected readonly dailyPage = signal<number>(Math.floor((new Date().getDate() - 1) / 7));
  protected readonly weekIndex = signal<number>(Math.floor((new Date().getDate() - 1) / 7));

  // ── Item-Level Pagination State ──
  protected readonly currentPage = signal<number>(1);
  protected readonly pageSize = signal<number>(12);

  constructor() {
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchQuery.set((value || '').trim().toLowerCase());
      this.currentPage.set(1);
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
      error: () => {
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

  // ── Period Switcher & Controls ──
  protected setPeriodGranularity(granularity: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all') {
    this.periodGranularity.set(granularity);
    this.currentPage.set(1);
    const now = new Date();
    if (granularity === 'daily') {
      const curDay = now.getDate();
      this.dailyPage.set(Math.floor((curDay - 1) / 7));
    } else if (granularity === 'weekly') {
      const curDay = now.getDate();
      this.weekIndex.set(Math.floor((curDay - 1) / 7));
    }
  }

  protected prevPeriod() {
    this.currentPage.set(1);
    const gran = this.periodGranularity();
    const y = this.selectedYear();
    const m = this.selectedMonth();

    if (gran === 'daily') {
      const p = this.dailyPage();
      if (p > 0) {
        this.dailyPage.set(p - 1);
      } else {
        const newM = m === 0 ? 11 : m - 1;
        const newY = m === 0 ? y - 1 : y;
        this.selectedMonth.set(newM);
        this.selectedYear.set(newY);
        const daysInPrev = new Date(newY, newM + 1, 0).getDate();
        this.dailyPage.set(Math.floor((daysInPrev - 1) / 7));
      }
    } else if (gran === 'weekly') {
      const w = this.weekIndex();
      if (w > 0) {
        this.weekIndex.set(w - 1);
      } else {
        const newM = m === 0 ? 11 : m - 1;
        const newY = m === 0 ? y - 1 : y;
        this.selectedMonth.set(newM);
        this.selectedYear.set(newY);
        const daysInPrev = new Date(newY, newM + 1, 0).getDate();
        this.weekIndex.set(Math.floor((daysInPrev - 1) / 7));
      }
    } else if (gran === 'monthly') {
      if (m === 0) {
        this.selectedMonth.set(11);
        this.selectedYear.set(y - 1);
      } else {
        this.selectedMonth.set(m - 1);
      }
    } else if (gran === 'yearly') {
      this.selectedYear.set(y - 1);
    }
  }

  protected nextPeriod() {
    this.currentPage.set(1);
    const gran = this.periodGranularity();
    const y = this.selectedYear();
    const m = this.selectedMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const maxDayPage = Math.floor((daysInMonth - 1) / 7);

    if (gran === 'daily') {
      const p = this.dailyPage();
      if (p < maxDayPage) {
        this.dailyPage.set(p + 1);
      } else {
        const newM = m === 11 ? 0 : m + 1;
        const newY = m === 11 ? y + 1 : y;
        this.selectedMonth.set(newM);
        this.selectedYear.set(newY);
        this.dailyPage.set(0);
      }
    } else if (gran === 'weekly') {
      const w = this.weekIndex();
      if (w < maxDayPage) {
        this.weekIndex.set(w + 1);
      } else {
        const newM = m === 11 ? 0 : m + 1;
        const newY = m === 11 ? y + 1 : y;
        this.selectedMonth.set(newM);
        this.selectedYear.set(newY);
        this.weekIndex.set(0);
      }
    } else if (gran === 'monthly') {
      if (m === 11) {
        this.selectedMonth.set(0);
        this.selectedYear.set(y + 1);
      } else {
        this.selectedMonth.set(m + 1);
      }
    } else if (gran === 'yearly') {
      this.selectedYear.set(y + 1);
    }
  }

  protected resetToCurrentPeriod() {
    const now = new Date();
    this.selectedYear.set(now.getFullYear());
    this.selectedMonth.set(now.getMonth());
    this.dailyPage.set(Math.floor((now.getDate() - 1) / 7));
    this.weekIndex.set(Math.floor((now.getDate() - 1) / 7));
    this.currentPage.set(1);
  }

  protected readonly periodLabel = computed(() => {
    const gran = this.periodGranularity();
    const y = this.selectedYear();
    const m = this.selectedMonth();
    const dObj = new Date(y, m, 1);
    const mName = dObj.toLocaleDateString('en-US', { month: 'long' });
    const mShort = dObj.toLocaleDateString('en-US', { month: 'short' });
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    if (gran === 'daily') {
      const p = this.dailyPage();
      const s = p * 7 + 1;
      const e = Math.min((p + 1) * 7, daysInMonth);
      return `${mShort} ${s} – ${e}, ${y}`;
    }

    if (gran === 'weekly') {
      const w = this.weekIndex();
      const s = w * 7 + 1;
      const e = Math.min((w + 1) * 7, daysInMonth);
      return `Week ${w + 1} (${s}–${e} ${mShort} ${y})`;
    }

    if (gran === 'monthly') {
      return `${mName} ${y}`;
    }

    if (gran === 'yearly') {
      return `${y}`;
    }

    return 'All Time History';
  });

  protected readonly isCurrentPeriod = computed(() => {
    const now = new Date();
    const gran = this.periodGranularity();
    const y = this.selectedYear();
    const m = this.selectedMonth();

    if (gran === 'daily') {
      const currentDayPage = Math.floor((now.getDate() - 1) / 7);
      return y === now.getFullYear() && m === now.getMonth() && this.dailyPage() === currentDayPage;
    }
    if (gran === 'weekly') {
      const currentWeek = Math.floor((now.getDate() - 1) / 7);
      return y === now.getFullYear() && m === now.getMonth() && this.weekIndex() === currentWeek;
    }
    if (gran === 'monthly') {
      return y === now.getFullYear() && m === now.getMonth();
    }
    if (gran === 'yearly') {
      return y === now.getFullYear();
    }
    return true;
  });

  // ── Filtered Transactions List ──
  protected readonly periodFilteredExpenses = computed(() => {
    let list = this.expenses();
    const gran = this.periodGranularity();
    const y = this.selectedYear();
    const m = this.selectedMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    if (gran === 'daily') {
      const p = this.dailyPage();
      const s = p * 7 + 1;
      const e = Math.min((p + 1) * 7, daysInMonth);
      list = list.filter((item) => {
        const d = new Date(item.date);
        return d.getFullYear() === y && d.getMonth() === m && d.getDate() >= s && d.getDate() <= e;
      });
    } else if (gran === 'weekly') {
      const w = this.weekIndex();
      const s = w * 7 + 1;
      const e = Math.min((w + 1) * 7, daysInMonth);
      list = list.filter((item) => {
        const d = new Date(item.date);
        return d.getFullYear() === y && d.getMonth() === m && d.getDate() >= s && d.getDate() <= e;
      });
    } else if (gran === 'monthly') {
      list = list.filter((item) => {
        const d = new Date(item.date);
        return d.getFullYear() === y && d.getMonth() === m;
      });
    } else if (gran === 'yearly') {
      list = list.filter((item) => {
        const d = new Date(item.date);
        return d.getFullYear() === y;
      });
    }

    // Category filter
    const cat = this.selectedCategory();
    if (cat !== 'all') {
      const catLower = cat.toLowerCase();
      list = list.filter((e) => (e.category || 'other').toLowerCase() === catLower);
    }

    // Search query filter
    const query = this.searchQuery();
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

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // ── Item-Level Pagination Computeds ──
  protected readonly totalCount = computed(() => this.periodFilteredExpenses().length);

  protected readonly totalPages = computed(() => {
    const total = this.totalCount();
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  protected readonly paginatedExpenses = computed(() => {
    const list = this.periodFilteredExpenses();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  protected readonly totalAmount = computed(() => {
    return this.periodFilteredExpenses().reduce((sum, e) => sum + (e.amount || 0), 0);
  });

  protected goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  protected prevPage() {
    this.goToPage(this.currentPage() - 1);
  }

  protected nextPage() {
    this.goToPage(this.currentPage() + 1);
  }

  protected setCategoryFilter(categoryName: string) {
    this.selectedCategory.set(categoryName);
    this.currentPage.set(1);
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
