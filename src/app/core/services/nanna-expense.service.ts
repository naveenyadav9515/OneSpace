import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface NannaExpense {
  _id: string;
  amount: number;
  reason: string;
  notes?: string;
  date: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NannaMonthBudget {
  year: number;
  month: number; // 1-indexed
  budget: number;
}

export interface NannaMonthGroup {
  /** e.g. "September 2026" */
  label: string;
  /** YYYY-MM key for sorting */
  key: string;
  year: number;
  month: number; // 0-indexed (JS Date month)
  total: number;
  count: number;
  expenses: NannaExpense[];
  /** Budget for this month (0 = not set) */
  budget: number;
}

export interface CreateNannaExpensePayload {
  amount: number;
  reason: string;
  date?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class NannaExpenseService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  /** All expenses, newest first */
  readonly expenses = signal<NannaExpense[]>([]);

  /** All saved monthly budgets: Map key = "YYYY-MM" */
  readonly budgets = signal<Map<string, number>>(new Map());

  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /** Computed: group expenses by Month+Year, newest month first, with budget merged in */
  readonly monthlyGroups = computed<NannaMonthGroup[]>(() => {
    const all = this.expenses();
    const budgetMap = this.budgets();
    const map = new Map<string, NannaMonthGroup>();

    for (const exp of all) {
      const d = new Date(exp.date);
      const year = d.getFullYear();
      const month = d.getMonth(); // 0-indexed
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;

      if (!map.has(key)) {
        const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        const budget = budgetMap.get(key) ?? 0;
        map.set(key, { label, key, year, month, total: 0, count: 0, expenses: [], budget });
      }

      const group = map.get(key)!;
      group.total += exp.amount;
      group.count += 1;
      group.expenses.push(exp);
    }

    // Sort each group's expenses newest-first, then sort groups newest-first
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    groups.sort((a, b) => b.key.localeCompare(a.key));
    return groups;
  });

  /** Computed: lifetime total */
  readonly lifetimeTotal = computed(() =>
    this.expenses().reduce((sum, e) => sum + e.amount, 0)
  );

  private get apiUrl(): string {
    return `${this.api.apiUrl}/nanna-expenses`;
  }

  /** Fetch expenses + budgets together on init */
  async fetchAll(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const [expRes, budgetRes] = await Promise.all([
        firstValueFrom(
          this.http.get<{ status: string; data: { expenses: NannaExpense[] } }>(this.apiUrl)
        ),
        firstValueFrom(
          this.http.get<{ status: string; data: { budgets: NannaMonthBudget[] } }>(`${this.apiUrl}/budgets`)
        ),
      ]);
      this.expenses.set(expRes.data.expenses);
      // Build the budget map: key = "YYYY-MM"
      const map = new Map<string, number>();
      for (const b of budgetRes.data.budgets) {
        const key = `${b.year}-${String(b.month).padStart(2, '0')}`;
        map.set(key, b.budget);
      }
      this.budgets.set(map);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load Nanna expenses.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Legacy alias kept for backward compatibility */
  async fetchExpenses(): Promise<void> {
    return this.fetchAll();
  }

  async createExpense(payload: CreateNannaExpensePayload): Promise<NannaExpense | null> {
    this.isSaving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ status: string; data: { expense: NannaExpense } }>(this.apiUrl, payload)
      );
      const newExpense = res.data.expense;
      this.expenses.update(list => [newExpense, ...list]);
      return newExpense;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to add expense.');
      return null;
    } finally {
      this.isSaving.set(false);
    }
  }

  async updateExpense(id: string, payload: Partial<CreateNannaExpensePayload>): Promise<NannaExpense | null> {
    this.isSaving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.put<{ status: string; data: { expense: NannaExpense } }>(`${this.apiUrl}/${id}`, payload)
      );
      const updated = res.data.expense;
      this.expenses.update(list =>
        list.map(e => e._id === id ? updated : e)
      );
      return updated;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to update expense.');
      return null;
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteExpense(id: string): Promise<boolean> {
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
      this.expenses.update(list => list.filter(e => e._id !== id));
      return true;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to delete expense.');
      return false;
    }
  }

  /**
   * Set (create or update) the budget for a given year and month (1-indexed month).
   * Returns the saved budget value or null on error.
   */
  async upsertBudget(year: number, month: number, budget: number): Promise<number | null> {
    this.isSaving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/budgets/${year}/${month}`, { budget })
      );
      // Update local signal
      const key = `${year}-${String(month).padStart(2, '0')}`;
      this.budgets.update(map => {
        const newMap = new Map(map);
        newMap.set(key, budget);
        return newMap;
      });
      return budget;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to save budget.');
      return null;
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Get the budget for a month key "YYYY-MM", returns 0 if not set */
  getBudgetForKey(key: string): number {
    return this.budgets().get(key) ?? 0;
  }

  /** Get the budget for a date string (uses the date's year+month) */
  getBudgetForDate(dateStr: string): number {
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return this.getBudgetForKey(key);
  }
}
