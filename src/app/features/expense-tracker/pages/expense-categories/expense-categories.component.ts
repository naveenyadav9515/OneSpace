import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  ExpenseService,
  CustomCategory,
  Expense
} from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

const FALLBACK_CATEGORY = 'Other';

@Component({
  selector: 'app-expense-categories',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, BottomNavComponent],
  templateUrl: './expense-categories.component.html',
  styleUrl: './expense-categories.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCategoriesComponent implements OnInit {
  private readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);

  protected readonly categories = signal<CustomCategory[]>([]);
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly isLoading = signal<boolean>(false);
  protected readonly isSaving = signal<boolean>(false);

  // New category inputs
  protected readonly newCategoryControl = new FormControl('', Validators.required);
  protected readonly newCategoryShortControl = new FormControl('');

  // Inline edit state
  protected readonly editingCategoryName = signal<string | null>(null);
  protected readonly editCategoryControl = new FormControl('', Validators.required);
  protected readonly editCategoryShortControl = new FormControl('');

  // Delete state
  protected readonly categoryPendingDelete = signal<string | null>(null);
  protected readonly isReassigning = signal<boolean>(false);

  protected readonly fallbackCategory = FALLBACK_CATEGORY;

  ngOnInit() {
    this.fetchData();
  }

  protected fetchData() {
    this.isLoading.set(true);
    this.expenseService.fetchCategories().subscribe({
      next: (res) => {
        if (res.data && Array.isArray(res.data)) {
          this.categories.set(res.data);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load categories', 'Error');
      },
    });

    this.expenseService.fetchExpenses().subscribe({
      next: (res) => {
        if (res.data && Array.isArray(res.data)) {
          this.expenses.set(res.data);
        }
      },
      error: (err) => console.error('Failed to load expenses for usage check', err),
    });
  }

  protected isProtectedCategory(name: string): boolean {
    return name.trim().toLowerCase() === FALLBACK_CATEGORY.toLowerCase();
  }

  protected categoryUsage(name: string): number {
    const key = name.trim().toLowerCase();
    return this.expenses().filter(
      (e) => (e.category || 'other').trim().toLowerCase() === key
    ).length;
  }

  protected addCategory() {
    const rawName = this.newCategoryControl.value?.trim() || '';
    if (!rawName) return;

    const existing = this.categories().map((c) => c.name.toLowerCase());
    if (existing.includes(rawName.toLowerCase())) {
      this.notificationService.warning('A category with this name already exists.', 'Duplicate');
      return;
    }

    const short = this.newCategoryShortControl.value?.trim();
    const nextList: CustomCategory[] = [
      ...this.categories(),
      { name: rawName, shortName: short || undefined },
    ];

    this.isSaving.set(true);
    this.expenseService.updateCategories(nextList).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.categories.set(res.data || nextList);
        this.newCategoryControl.reset();
        this.newCategoryShortControl.reset();
        this.notificationService.success(`Category "${rawName}" added.`, 'Added');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to add category',
          'Error'
        );
      },
    });
  }

  protected startEditCategory(cat: CustomCategory) {
    this.editingCategoryName.set(cat.name);
    this.editCategoryControl.setValue(cat.name);
    this.editCategoryShortControl.setValue(cat.shortName || '');
  }

  protected cancelEditCategory() {
    this.editingCategoryName.set(null);
    this.editCategoryControl.reset();
    this.editCategoryShortControl.reset();
  }

  protected getCategoryIcon(category: string): string {
    const cat = (category || '').toLowerCase();
    if (cat.includes('food') || cat.includes('dining') || cat.includes('cafe') || cat.includes('restaurant')) return 'restaurant';
    if (cat.includes('transport') || cat.includes('travel') || cat.includes('cab') || cat.includes('car') || cat.includes('bike') || cat.includes('fuel')) return 'directions_car';
    if (cat.includes('shop') || cat.includes('mall') || cat.includes('amazon') || cat.includes('flipkart') || cat.includes('clothes')) return 'local_mall';
    if (cat.includes('util') || cat.includes('bill') || cat.includes('recharge') || cat.includes('electric') || cat.includes('wifi')) return 'bolt';
    if (cat.includes('entertain') || cat.includes('movie') || cat.includes('cinema') || cat.includes('gaming')) return 'movie';
    if (cat.includes('health') || cat.includes('med') || cat.includes('doc') || cat.includes('gym') || cat.includes('fitness')) return 'medical_services';
    if (cat.includes('rent') || cat.includes('home') || cat.includes('house') || cat.includes('housing')) return 'home';
    if (cat.includes('part') || cat.includes('meetup') || cat.includes('event') || cat.includes('drink') || cat.includes('party')) return 'celebration';
    if (cat.includes('relat') || cat.includes('family') || cat.includes('friend') || cat.includes('loan') || cat.includes('gift')) return 'diversity_3';
    if (cat.includes('invest') || cat.includes('stock') || cat.includes('gold') || cat.includes('mutual')) return 'trending_up';
    if (cat.includes('grocer') || cat.includes('supermarket')) return 'shopping_basket';
    if (cat.includes('edu') || cat.includes('course') || cat.includes('book')) return 'school';
    return 'category';
  }

  protected getCategoryToneClass(category: string): string {
    const cat = (category || '').toLowerCase();
    if (cat.includes('food') || cat.includes('dining') || cat.includes('cafe') || cat.includes('restaurant')) return 'tone-orange';
    if (cat.includes('transport') || cat.includes('travel') || cat.includes('cab') || cat.includes('car') || cat.includes('bike') || cat.includes('fuel')) return 'tone-cyan';
    if (cat.includes('shop') || cat.includes('mall') || cat.includes('amazon') || cat.includes('flipkart') || cat.includes('clothes')) return 'tone-pink';
    if (cat.includes('util') || cat.includes('bill') || cat.includes('recharge') || cat.includes('electric') || cat.includes('wifi')) return 'tone-amber';
    if (cat.includes('entertain') || cat.includes('movie') || cat.includes('cinema') || cat.includes('gaming')) return 'tone-purple';
    if (cat.includes('health') || cat.includes('med') || cat.includes('doc') || cat.includes('gym') || cat.includes('fitness')) return 'tone-green';
    if (cat.includes('rent') || cat.includes('home') || cat.includes('house') || cat.includes('housing')) return 'tone-indigo';
    if (cat.includes('part') || cat.includes('meetup') || cat.includes('event') || cat.includes('drink') || cat.includes('party')) return 'tone-fuchsia';
    if (cat.includes('relat') || cat.includes('family') || cat.includes('friend') || cat.includes('loan') || cat.includes('gift')) return 'tone-teal';
    if (cat.includes('invest') || cat.includes('stock') || cat.includes('gold') || cat.includes('mutual')) return 'tone-emerald';
    if (cat.includes('grocer') || cat.includes('supermarket')) return 'tone-orange';
    if (cat.includes('edu') || cat.includes('course') || cat.includes('book')) return 'tone-indigo';
    return 'tone-slate';
  }

  protected applyEditCategory() {
    const originalName = this.editingCategoryName();
    if (!originalName) return;

    const newName = this.editCategoryControl.value?.trim() || '';
    if (!newName) return;

    const newShort = this.editCategoryShortControl.value?.trim();
    const nameChanged = originalName.toLowerCase() !== newName.toLowerCase();

    // Check for duplicate category name
    if (nameChanged) {
      const isDuplicate = this.categories().some(
        (c) => c.name.toLowerCase() === newName.toLowerCase()
      );
      if (isDuplicate) {
        this.notificationService.warning('A category with this name already exists.', 'Duplicate');
        return;
      }
    }

    const updatedList = this.categories().map((c) => {
      if (c.name.toLowerCase() === originalName.toLowerCase()) {
        return { name: newName, shortName: newShort || undefined };
      }
      return c;
    });

    this.isSaving.set(true);

    if (nameChanged) {
      // Reassign all past transactions from old name to new name so data is never lost or orphaned
      this.expenseService.reassignCategory(originalName, newName).subscribe({
        next: (reassignRes) => {
          const movedCount = reassignRes.data?.expensesUpdated || 0;
          this.expenseService.updateCategories(updatedList).subscribe({
            next: (res) => {
              this.isSaving.set(false);
              this.categories.set(res.data || updatedList);
              this.editingCategoryName.set(null);
              // Update local expenses signal
              this.expenses.update((list) =>
                list.map((e) =>
                  (e.category || '').toLowerCase() === originalName.toLowerCase()
                    ? { ...e, category: newName }
                    : e
                )
              );
              this.notificationService.success(
                movedCount > 0
                  ? `Category renamed to "${newName}". ${movedCount} transaction(s) updated.`
                  : `Category renamed to "${newName}".`,
                'Category Updated'
              );
            },
            error: (err) => {
              this.isSaving.set(false);
              this.notificationService.error(
                err?.error?.message || 'Failed to update category list',
                'Error'
              );
            },
          });
        },
        error: (err) => {
          this.isSaving.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to rename category transactions',
            'Error'
          );
        },
      });
    } else {
      // Only shortName changed
      this.expenseService.updateCategories(updatedList).subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.categories.set(res.data || updatedList);
          this.editingCategoryName.set(null);
          this.notificationService.success('Category details updated.', 'Saved');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to update category',
            'Error'
          );
        },
      });
    }
  }

  protected promptDeleteCategory(name: string) {
    this.categoryPendingDelete.set(name);
  }

  protected cancelDeleteCategory() {
    this.categoryPendingDelete.set(null);
  }

  protected confirmDeleteCategory(name: string) {
    this.isReassigning.set(true);
    const updatedList = this.categories().filter(
      (c) => c.name.toLowerCase() !== name.toLowerCase()
    );

    // Reassign any existing transactions from deleted category to "Other"
    this.expenseService.reassignCategory(name, FALLBACK_CATEGORY).subscribe({
      next: (res) => {
        const movedCount = res.data?.expensesUpdated || 0;
        this.expenseService.updateCategories(updatedList).subscribe({
          next: () => {
            this.isReassigning.set(false);
            this.categories.set(updatedList);
            this.categoryPendingDelete.set(null);
            // Update local expenses signal
            this.expenses.update((list) =>
              list.map((e) =>
                (e.category || '').toLowerCase() === name.toLowerCase()
                  ? { ...e, category: FALLBACK_CATEGORY }
                  : e
              )
            );
            this.notificationService.success(
              movedCount > 0
                ? `"${name}" removed. ${movedCount} transaction(s) moved to "${FALLBACK_CATEGORY}".`
                : `"${name}" removed.`,
              'Category Deleted'
            );
          },
          error: (err) => {
            this.isReassigning.set(false);
            this.notificationService.error('Failed to update category list', 'Error');
          },
        });
      },
      error: (err) => {
        this.isReassigning.set(false);
        this.notificationService.error(
          err?.error?.message || 'Could not move transactions. Category preserved.',
          'Error'
        );
      },
    });
  }
}
