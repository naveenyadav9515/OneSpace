import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export const DEFAULT_RENTAL_TENANTS = ['Mahesh', 'Sai', 'Geetha', 'Prasad', 'Rekha'] as const;
export type RentalTenant = string;

export interface TenantInfo {
  name: string;
  isActive: boolean;
  createdAt?: string;
}

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
  readonly tenants = signal<TenantInfo[]>(
    DEFAULT_RENTAL_TENANTS.map(name => ({ name, isActive: true }))
  );
  readonly activeTenants = computed<string[]>(() =>
    this.tenants().filter(t => t.isActive).map(t => t.name)
  );
  readonly activeTenantList = computed<TenantInfo[]>(() =>
    this.tenants().filter(t => t.isActive)
  );
  readonly disabledTenantList = computed<TenantInfo[]>(() =>
    this.tenants().filter(t => !t.isActive)
  );
  readonly isLoadingTenants = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /** Saving state per tenant (key = tenant name) */
  readonly savingTenant = signal<string | null>(null);

  /** Computed: group collections by Month+Year, newest first.
   *  Within each month, group by tenant from backend list. */
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

      // Order tenants based on backend list, including any existing in user's records
      const allTenantNames = Array.from(new Set([...this.tenants().map(t => t.name), ...tenantMap.keys()]));
      for (const tenant of allTenantNames) {
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

  async fetchTenants(): Promise<TenantInfo[]> {
    this.isLoadingTenants.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; data: { tenants: (TenantInfo | string)[]; activeTenants?: string[] } }>(
          `${this.apiUrl}/tenants`
        )
      );
      if (res.data?.tenants?.length) {
        const normalized: TenantInfo[] = res.data.tenants.map(t =>
          typeof t === 'string' ? { name: t, isActive: true } : t
        );
        this.tenants.set(normalized);
        return normalized;
      }
      return this.tenants();
    } catch (err: any) {
      console.warn('Failed to load tenants from backend:', err?.message);
      return this.tenants();
    } finally {
      this.isLoadingTenants.set(false);
    }
  }

  async addTenant(name: string): Promise<TenantInfo | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ status: string; data: { tenant: TenantInfo; tenants?: TenantInfo[] } }>(
          `${this.apiUrl}/tenants`,
          { name }
        )
      );
      if (res.data?.tenants) {
        this.tenants.set(res.data.tenants);
      } else if (res.data?.tenant) {
        this.tenants.update(list => [
          ...list.filter(t => t.name.toLowerCase() !== name.toLowerCase()),
          res.data.tenant,
        ]);
      }
      return res.data.tenant;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to add tenant.');
      throw err;
    }
  }

  async toggleTenant(name: string): Promise<TenantInfo | null> {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ status: string; data: { tenant: TenantInfo; tenants?: TenantInfo[] } }>(
          `${this.apiUrl}/tenants/${encodeURIComponent(name)}/toggle`,
          {}
        )
      );
      if (res.data?.tenants) {
        this.tenants.set(res.data.tenants);
      } else if (res.data?.tenant) {
        this.tenants.update(list =>
          list.map(t => (t.name.toLowerCase() === name.toLowerCase() ? res.data.tenant : t))
        );
      }
      return res.data.tenant;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to update tenant status.');
      throw err;
    }
  }

  async deleteTenant(name: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.delete<{ status: string; data: { tenants?: TenantInfo[]; tenant?: TenantInfo } }>(
          `${this.apiUrl}/tenants/${encodeURIComponent(name)}`
        )
      );
      if (res.data?.tenants) {
        this.tenants.set(res.data.tenants);
      } else {
        this.tenants.update(list => list.filter(t => t.name.toLowerCase() !== name.toLowerCase()));
      }
      return true;
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to delete tenant.');
      throw err;
    }
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
      // Insert and keep sorted newest first by date
      this.collections.update(list => {
        const updated = [newEntry, ...list];
        return updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });
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
