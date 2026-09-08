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
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /** Computed: group expenses by Month+Year, newest month first */
  readonly monthlyGroups = computed<NannaMonthGroup[]>(() => {
    const all = this.expenses();
    const map = new Map<string, NannaMonthGroup>();

    for (const exp of all) {
      const d = new Date(exp.date);
      const year = d.getFullYear();
      const month = d.getMonth(); // 0-indexed
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;

      if (!map.has(key)) {
        const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        map.set(key, { label, key, year, month, total: 0, count: 0, expenses: [] });
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

  async fetchExpenses(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; data: { expenses: NannaExpense[] } }>(this.apiUrl)
      );
      this.expenses.set(res.data.expenses);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load Nanna expenses.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async createExpense(payload: CreateNannaExpensePayload): Promise<NannaExpense | null> {
    this.isSaving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ status: string; data: { expense: NannaExpense } }>(this.apiUrl, payload)
      );
      const newExpense = res.data.expense;
      // Prepend to local state (newest first)
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
}
