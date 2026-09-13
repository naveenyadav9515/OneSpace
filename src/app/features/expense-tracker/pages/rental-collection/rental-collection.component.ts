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
  RentalCollectionService,
  RentalCollection,
  RentalTenantGroup,
  RENTAL_TENANTS,
  RentalTenant,
} from '@core/services/rental-collection.service';

interface TenantFormState {
  amount: string;
  notes: string;
  success: boolean;
  error: string;
}

@Component({
  selector: 'app-rental-collection',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, BottomNavComponent],
  templateUrl: './rental-collection.component.html',
  styleUrl: './rental-collection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalCollectionComponent implements OnInit {
  readonly svc = inject(RentalCollectionService);
  readonly tenants = RENTAL_TENANTS;

  // ── Log panel state ──
  readonly isPanelOpen = signal(false);
  logDate = this.todayIso();

  // ── Per-tenant form states ──
  tenantForms: Record<string, TenantFormState> = this.buildForms();

  // ── Delete confirmation ──
  readonly deletingId = signal<string | null>(null);

  // ── Expand/collapse tenant rows on main screen ──
  expandedTenants = new Set<string>();

  ngOnInit(): void {
    this.svc.fetchCollections();
  }

  // ──────────────────────────────────────
  //  LOG PANEL
  // ──────────────────────────────────────

  openPanel(): void {
    this.logDate = this.todayIso();
    this.tenantForms = this.buildForms();
    this.isPanelOpen.set(true);
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
  }

  async logPayment(tenant: RentalTenant): Promise<void> {
    const form = this.tenantForms[tenant];
    const amount = parseFloat(form.amount);

    form.error = '';
    form.success = false;

    if (!amount || amount <= 0) {
      form.error = 'Enter a valid amount';
      return;
    }

    const result = await this.svc.addCollection({
      tenant,
      amount,
      date: this.logDate || this.todayIso(),
      notes: form.notes.trim() || undefined,
    });

    if (result) {
      form.amount = '';
      form.notes = '';
      form.success = true;
      // Clear success indicator after 2 sec
      setTimeout(() => {
        form.success = false;
      }, 2000);
    } else {
      form.error = this.svc.error() || 'Failed to save.';
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
    await this.svc.deleteCollection(id);
    this.deletingId.set(null);
  }

  // ──────────────────────────────────────
  //  EXPAND/COLLAPSE TENANT ROWS
  // ──────────────────────────────────────

  toggleTenant(key: string): void {
    if (this.expandedTenants.has(key)) {
      this.expandedTenants.delete(key);
    } else {
      this.expandedTenants.add(key);
    }
  }

  isTenantExpanded(key: string): boolean {
    return this.expandedTenants.has(key);
  }

  // ──────────────────────────────────────
  //  UTILITIES
  // ──────────────────────────────────────

  private buildForms(): Record<string, TenantFormState> {
    const forms: Record<string, TenantFormState> = {};
    for (const t of RENTAL_TENANTS) {
      forms[t] = { amount: '', notes: '', success: false, error: '' };
    }
    return forms;
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 16);
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

  tenantInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  // Avatar color per tenant
  tenantColor(name: string): string {
    const colors: Record<string, string> = {
      Mahesh: '#7c6af7',
      Sai: '#06b6d4',
      Geetha: '#f59e0b',
      Prasad: '#10b981',
      Rekha: '#ec4899',
    };
    return colors[name] ?? '#7c6af7';
  }
}
