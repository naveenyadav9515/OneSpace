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
  RentalTenant,
} from '@core/services/rental-collection.service';
import { NotificationService } from '@core/services/notification.service';

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
  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  // ── Log panel state ──
  readonly isPanelOpen = signal(false);
  readonly isSubmitting = signal(false);

  // ── Manage Tenants Modal state ──
  readonly isTenantModalOpen = signal(false);
  readonly activeTenantTab = signal<'active' | 'disabled'>('active');
  newTenantName = '';
  readonly tenantFormError = signal('');
  readonly isSavingTenant = signal(false);
  readonly togglingTenantName = signal<string | null>(null);
  readonly deletingTenantName = signal<string | null>(null);
  readonly deletingTenantConfirm = signal<string | null>(null);

  // ── Custom dropdown state ──
  readonly isDropdownOpen = signal(false);

  // ── Single form fields ──
  selectedTenant: RentalTenant | null = null;
  logDate = this.todayIso();
  formAmount = '';
  formNotes = '';
  readonly formError = signal('');

  // ── Delete confirmation ──
  readonly deletingId = signal<string | null>(null);

  // ── Expand/collapse tenant rows on main screen ──
  expandedTenants = new Set<string>();

  ngOnInit(): void {
    this.svc.fetchCollections();
    this.svc.fetchTenants();
  }

  // ──────────────────────────────────────
  //  TENANT MANAGEMENT MODAL
  // ──────────────────────────────────────

  setTenantTab(tab: 'active' | 'disabled'): void {
    this.activeTenantTab.set(tab);
    this.deletingTenantConfirm.set(null);
  }

  promptDeleteTenant(name: string): void {
    this.deletingTenantConfirm.set(name);
  }

  cancelDeleteTenant(): void {
    this.deletingTenantConfirm.set(null);
  }

  openTenantModal(): void {
    this.newTenantName = '';
    this.tenantFormError.set('');
    this.activeTenantTab.set('active');
    this.deletingTenantConfirm.set(null);
    this.isTenantModalOpen.set(true);
    this.svc.fetchTenants();
  }

  closeTenantModal(): void {
    this.isTenantModalOpen.set(false);
    this.newTenantName = '';
    this.tenantFormError.set('');
    this.deletingTenantConfirm.set(null);
  }

  async addNewTenant(): Promise<void> {
    const raw = this.newTenantName.trim();
    if (!raw) {
      this.tenantFormError.set('Please enter a tenant name.');
      return;
    }
    if (raw.length > 50) {
      this.tenantFormError.set('Name cannot exceed 50 characters.');
      return;
    }

    this.tenantFormError.set('');
    this.isSavingTenant.set(true);
    this.cdr.markForCheck();

    try {
      const result = await this.svc.addTenant(raw);
      this.zone.run(() => {
        this.newTenantName = '';
        this.isSavingTenant.set(false);
        this.activeTenantTab.set('active');
        this.notificationService.success(`Tenant "${result?.name || raw}" added.`, 'Success');
        this.cdr.markForCheck();
      });
    } catch (err: any) {
      this.zone.run(() => {
        this.tenantFormError.set(err?.error?.message || err?.message || 'Failed to add tenant.');
        this.isSavingTenant.set(false);
        this.cdr.markForCheck();
      });
    }
  }

  async toggleTenantStatus(name: string): Promise<void> {
    this.togglingTenantName.set(name);
    this.cdr.markForCheck();

    try {
      const updated = await this.svc.toggleTenant(name);
      this.zone.run(() => {
        this.togglingTenantName.set(null);
        const status = updated?.isActive ? 'enabled' : 'disabled';
        this.notificationService.info(`Tenant "${name}" ${status}.`, 'Tenant Updated');
        if (!updated?.isActive && this.selectedTenant === name) {
          this.selectedTenant = null;
        }
        this.cdr.markForCheck();
      });
    } catch (err: any) {
      this.zone.run(() => {
        this.togglingTenantName.set(null);
        this.notificationService.error(err?.error?.message || 'Failed to update tenant status.', 'Error');
        this.cdr.markForCheck();
      });
    }
  }

  async deleteTenant(name: string): Promise<void> {
    this.deletingTenantName.set(name);
    this.cdr.markForCheck();

    try {
      await this.svc.deleteTenant(name);
      this.zone.run(() => {
        this.deletingTenantName.set(null);
        this.deletingTenantConfirm.set(null);
        this.notificationService.success(`Tenant "${name}" deleted.`, 'Removed');
        if (this.selectedTenant === name) {
          this.selectedTenant = null;
        }
        this.cdr.markForCheck();
      });
    } catch (err: any) {
      this.zone.run(() => {
        this.deletingTenantName.set(null);
        this.deletingTenantConfirm.set(null);
        this.notificationService.error(err?.error?.message || 'Failed to delete tenant.', 'Error');
        this.cdr.markForCheck();
      });
    }
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
    this.isDropdownOpen.set(false);
    this.isSubmitting.set(false);
    this.isPanelOpen.set(true);
    // Fetch latest tenants from backend
    this.svc.fetchTenants();
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
    this.isDropdownOpen.set(false);
    this.isSubmitting.set(false);
    this.formError.set('');
  }

  // ── Tenant dropdown ──
  toggleDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.isSubmitting()) return;
    this.isDropdownOpen.update(v => !v);
    this.cdr.markForCheck();
  }

  closeDropdown(): void {
    if (this.isDropdownOpen()) {
      this.isDropdownOpen.set(false);
      this.cdr.markForCheck();
    }
  }

  selectTenant(tenant: RentalTenant, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedTenant = tenant;
    this.formError.set('');
    this.isDropdownOpen.set(false);
    this.cdr.markForCheck();
  }

  // ── Log payment ──
  async logPayment(): Promise<void> {
    if (this.isSubmitting()) return;

    this.formError.set('');

    if (!this.selectedTenant) {
      this.formError.set('Please select a tenant.');
      return;
    }

    const amount = parseFloat(this.formAmount);
    if (!amount || amount <= 0) {
      this.formError.set('Please enter a valid amount greater than 0.');
      return;
    }

    this.isSubmitting.set(true);
    this.cdr.markForCheck();

    try {
      const result = await this.svc.addCollection({
        tenant: this.selectedTenant,
        amount,
        date: this.logDate ? new Date(this.logDate).toISOString() : new Date().toISOString(),
        notes: this.formNotes.trim() || undefined,
      });

      this.zone.run(() => {
        if (result) {
          // Expand newly added tenant group so it's immediately visible
          const d = new Date(result.date);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          this.expandedTenants.add(`${monthKey}-${result.tenant}`);

          // Close popup immediately
          this.closePanel();

          // Show standard application toast
          this.notificationService.success(
            `₹${result.amount.toLocaleString('en-IN')} rent logged for ${result.tenant}.`,
            'Saved'
          );
        } else {
          this.formError.set(this.svc.error() || 'Failed to save. Please try again.');
          this.isSubmitting.set(false);
        }
        this.cdr.markForCheck();
      });
    } catch (err: any) {
      this.zone.run(() => {
        this.formError.set(err?.message || 'Failed to save. Please try again.');
        this.isSubmitting.set(false);
        this.cdr.markForCheck();
      });
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
    const success = await this.svc.deleteCollection(id);
    this.zone.run(() => {
      this.deletingId.set(null);
      if (success) {
        this.notificationService.success('Rental payment deleted.', 'Deleted');
      } else {
        this.notificationService.error(this.svc.error() || 'Failed to delete payment.', 'Error');
      }
      this.cdr.markForCheck();
    });
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
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
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
    if (colors[name]) return colors[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palette = ['#7c6af7', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#3b82f6'];
    return palette[Math.abs(hash) % palette.length];
  }
}
