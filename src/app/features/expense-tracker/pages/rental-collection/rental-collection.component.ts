import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  signal,
  OnInit,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  RentalCollectionService,
  RentalCollection,
  RENTAL_TENANTS,
  RentalTenant,
} from '@core/services/rental-collection.service';

@Component({
  selector: 'app-rental-collection',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, BottomNavComponent],
  templateUrl: './rental-collection.component.html',
  styleUrl: './rental-collection.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalCollectionComponent implements OnInit {
  readonly svc  = inject(RentalCollectionService);
  private readonly cdr  = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  readonly tenants = RENTAL_TENANTS;

  // ── Log panel state ──
  readonly isPanelOpen = signal(false);

  // ── Custom dropdown state ──
  readonly isDropdownOpen = signal(false);

  // ── Single form fields ──
  selectedTenant: RentalTenant | null = null;
  logDate = this.todayIso();
  formAmount = '';
  formNotes = '';
  readonly formError = signal('');
  readonly formSuccess = signal(false);

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
    this.selectedTenant = null;
    this.logDate = this.todayIso();
    this.formAmount = '';
    this.formNotes = '';
    this.formError.set('');
    this.formSuccess.set(false);
    this.isDropdownOpen.set(false);
    this.isPanelOpen.set(true);
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
    this.isDropdownOpen.set(false);
  }

  // ── Tenant dropdown ──
  toggleDropdown(): void {
    this.isDropdownOpen.update(v => !v);
  }

  selectTenant(tenant: RentalTenant): void {
    this.selectedTenant = tenant;
    this.formError.set('');
    this.isDropdownOpen.set(false);
  }

  // ── Log payment ──
  async logPayment(): Promise<void> {
    this.formError.set('');
    this.formSuccess.set(false);

    if (!this.selectedTenant) {
      this.formError.set('Please select a tenant.');
      return;
    }

    const amount = parseFloat(this.formAmount);
    if (!amount || amount <= 0) {
      this.formError.set('Please enter a valid amount greater than 0.');
      return;
    }

    const result = await this.svc.addCollection({
      tenant: this.selectedTenant,
      amount,
      date: this.logDate || this.todayIso(),
      notes: this.formNotes.trim() || undefined,
    });

    // Run inside NgZone so OnPush change detection fires reliably
    this.zone.run(() => {
      if (result) {
        this.formAmount = '';
        this.formNotes = '';
        this.formError.set('');
        this.formSuccess.set(true);
        setTimeout(() => {
          this.formSuccess.set(false);
          this.isPanelOpen.set(false);
          this.cdr.markForCheck();
        }, 800);
      } else {
        this.formError.set(this.svc.error() || 'Failed to save. Please try again.');
      }
      this.cdr.markForCheck();
    });
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

  tenantColor(name: string): string {
    const colors: Record<string, string> = {
      Mahesh: '#7c6af7',
      Sai:    '#06b6d4',
      Geetha: '#f59e0b',
      Prasad: '#10b981',
      Rekha:  '#ec4899',
    };
    return colors[name] ?? '#7c6af7';
  }
}
