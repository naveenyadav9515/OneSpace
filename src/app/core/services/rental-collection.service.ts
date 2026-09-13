import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export const RENTAL_TENANTS = ['Mahesh', 'Sai', 'Geetha', 'Prasad', 'Rekha'] as const;
export type RentalTenant = typeof RENTAL_TENANTS[number];

export interface RentalCollection {
  _id: string;
  tenant: RentalTenant;
  amount: number;
  notes?: string;
  date: string;
  createdAt?: string;
}

export interface RentalTenantGroup {
  tenant: RentalTenant;
  total: number;
  payments: RentalCollection[];
}

export interface RentalMonthGroup {
  /** e.g. "September 2026" */
  label: string;
  /** YYYY-MM key for sorting */
  key: string;
  totalCollected: number;
  tenantGroups: RentalTenantGroup[];
}

export interface CreateRentalCollectionPayload {
  tenant: RentalTenant;
  amount: number;
  date?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class RentalCollectionService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);

  readonly collections = signal<RentalCollection[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /** Saving state per tenant (key = tenant name) */
  readonly savingTenant = signal<string | null>(null);

  /** Computed: group collections by Month+Year, newest first.
   *  Within each month, group by tenant in the fixed order. */
  readonly monthlyGroups = computed<RentalMonthGroup[]>(() => {
    const all = this.collections();
    const monthMap = new Map<string, Map<string, RentalCollection[]>>();

    for (const entry of all) {
      const d = new Date(entry.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, new Map());
      }
      const tenantMap = monthMap.get(monthKey)!;
      if (!tenantMap.has(entry.tenant)) {
        tenantMap.set(entry.tenant, []);
      }
      tenantMap.get(entry.tenant)!.push(entry);
    }

    const groups: RentalMonthGroup[] = [];

    for (const [monthKey, tenantMap] of monthMap) {
      const firstEntry = all.find(e => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthKey;
      });
      const label = firstEntry
        ? new Date(firstEntry.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : monthKey;

      let totalCollected = 0;
      const tenantGroups: RentalTenantGroup[] = [];

      // Keep tenants in fixed order, only include those with payments in this month
      for (const tenant of RENTAL_TENANTS) {
        const payments = tenantMap.get(tenant) ?? [];
        if (payments.length === 0) continue;
        // Sort newest first
        payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const total = payments.reduce((s, p) => s + p.amount, 0);
        totalCollected += total;
        tenantGroups.push({ tenant, total, payments });
      }

      groups.push({ label, key: monthKey, totalCollected, tenantGroups });
    }

    // Sort months newest first
    groups.sort((a, b) => b.key.localeCompare(a.key));
    return groups;
  });

  /** Computed: lifetime total collected */
  readonly lifetimeTotal = computed(() =>
    this.collections().reduce((s, e) => s + e.amount, 0)
  );

  private get apiUrl(): string {
    return `${this.api.apiUrl}/rental-collections`;
  }

  async fetchCollections(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; data: { collections: RentalCollection[] } }>(this.apiUrl)
      );
      this.collections.set(res.data.collections);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load rental collections.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async addCollection(payload: CreateRentalCollectionPayload): Promise<RentalCollection | null> {
    this.savingTenant.set(payload.tenant);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ status: string; data: { collection: RentalCollection } }>(this.apiUrl, payload)
      );
      const newEntry = res.data.collection;
      // Insert newest first
      this.collections.update(list => [newEntry, ...list]);
      return newEntry;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to log payment.');
      return null;
    } finally {
      this.savingTenant.set(null);
    }
  }

  async deleteCollection(id: string): Promise<boolean> {
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
      this.collections.update(list => list.filter(e => e._id !== id));
      return true;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to delete entry.');
      return false;
    }
  }
}
