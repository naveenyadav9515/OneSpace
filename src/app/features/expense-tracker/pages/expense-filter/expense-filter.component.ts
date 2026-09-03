import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import {
  Expense,
  ExpenseService,
  CustomCategory,
  ExpensePayload,
} from '@core/services/expense.service';
import {
  ExpenseFilterStateService,
  DatePreset,
  AmountPreset,
  SortOption,
  TimeOfDayFilter,
  SourceFilter,
} from '@core/services/expense-filter-state.service';
import { NotificationService } from '@core/services/notification.service';

export interface ActiveFilterChip {
  id: string;
  type: 'search' | 'date' | 'category' | 'tag' | 'sort' | 'amount' | 'time' | 'field' | 'source' | 'payment' | 'cleanup';
  label: string;
  value?: string;
}

@Component({
  selector: 'app-expense-filter',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, FormsModule, BottomNavComponent],
  templateUrl: './expense-filter.component.html',
  styleUrl: './expense-filter.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseFilterComponent implements OnInit, OnDestroy {
  private readonly expenseService = inject(ExpenseService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly stateService = inject(ExpenseFilterStateService);

  // ── Raw Data Signals ──
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly categories = signal<CustomCategory[]>([]);
  protected readonly isLoading = signal<boolean>(true);

  // ── Filter Sidebar Window State ──
  protected readonly isSidebarOpen = signal<boolean>(false);

  // ── 1. Search Query ──
  protected readonly searchControl = new FormControl(this.stateService.state.searchQuery);
  protected readonly searchQuery = signal<string>(this.stateService.state.searchQuery);

  // ── 2. Timeframe ──
  protected readonly datePreset = signal<DatePreset>(this.stateService.state.datePreset);
  protected readonly customStartDate = signal<string>(this.stateService.state.customStartDate);
  protected readonly customEndDate = signal<string>(this.stateService.state.customEndDate);

  // ── 3. Category ──
  protected readonly selectedCategories = signal<string[]>([...this.stateService.state.selectedCategories]);

  // ── 4. Tags ──
  protected readonly selectedTags = signal<string[]>([...this.stateService.state.selectedTags]);
  protected readonly includeUntagged = signal<boolean>(this.stateService.state.includeUntagged || false);

  // ── 5. Sort ──
  protected readonly sortBy = signal<SortOption>(this.stateService.state.sortBy);

  // ── 6. Remaining Filters ──
  protected readonly amountPreset = signal<AmountPreset>(this.stateService.state.amountPreset);
  protected readonly amountMin = signal<number | null>(this.stateService.state.amountMin);
  protected readonly amountMax = signal<number | null>(this.stateService.state.amountMax);

  protected readonly timeOfDayFilter = signal<TimeOfDayFilter>(this.stateService.state.timeOfDayFilter || 'all');

  // Input Field Presence Filters (Title, Merchant, Category, Tags, Notes, PaymentMethod)
  protected readonly presentFields = signal<string[]>([...this.stateService.state.presentFields]);

  // Entry Source & Edit Tracking (Gmail auto vs Manual vs Manually Edited)
  protected readonly sourceFilter = signal<SourceFilter>(this.stateService.state.sourceFilter || 'all');

  // ── 7. Payment Methods ──
  protected readonly selectedPaymentMethods = signal<string[]>([...this.stateService.state.selectedPaymentMethods]);

  // ── 8. Clean Up (Data Health & Missing/Filled Fields) ──
  protected readonly cleanupFields = signal<string[]>([...(this.stateService.state.cleanupFields || [])]);
  protected readonly cleanupMode = signal<'missing' | 'present'>(this.stateService.state.cleanupMode || 'missing');
  protected readonly cleanupMatch = signal<'any' | 'all'>(this.stateService.state.cleanupMatch || 'any');

  protected readonly cleanupFieldDefinitions = [
    { id: 'notes', icon: 'description', missingLabel: 'Without Notes', presentLabel: 'Has Notes' },
    { id: 'tags', icon: 'label', missingLabel: 'Untagged', presentLabel: 'Has Tags' },
    { id: 'category', icon: 'category', missingLabel: 'Uncategorized', presentLabel: 'Categorized' },
    { id: 'title', icon: 'title', missingLabel: 'No Custom Title', presentLabel: 'Has Custom Title' },
    { id: 'merchant', icon: 'storefront', missingLabel: 'No Merchant', presentLabel: 'Has Merchant' },
    { id: 'paymentMethod', icon: 'credit_card', missingLabel: 'No Payment Method', presentLabel: 'Has Payment Method' },
  ];

  // ── Pagination State ──
  protected readonly currentPage = signal<number>(this.stateService.state.currentPage || 1);
  protected readonly pageSize = signal<number>(this.stateService.state.pageSize || 15);
  protected readonly availablePageSizes = [10, 15, 25, 50, 100];

  // ── Delete Prompt State ──
  protected readonly deleteConfirmId = signal<string | null>(null);

  // ── Quick Edit Modal State (Continuous In-Place Edits) ──
  protected readonly editingExpense = signal<Expense | null>(null);
  protected readonly isSavingEdit = signal<boolean>(false);
  protected readonly editAmount = signal<number | null>(null);
  protected readonly editTitle = signal<string>('');
  protected readonly editCategory = signal<string>('Other');
  protected readonly editMerchant = signal<string>('');
  protected readonly editDate = signal<string>('');
  protected readonly editPaymentMethod = signal<string>('UPI');
  protected readonly editTags = signal<string[]>([]);
  protected readonly editNotes = signal<string>('');
  protected readonly editTagInput = signal<string>('');

  // ── Payment Methods Catalog ──
  protected readonly defaultPaymentMethods = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Cash', 'Other'];

  constructor() {
    this.searchControl.valueChanges.subscribe((val) => {
      const q = (val || '').trim().toLowerCase();
      this.searchQuery.set(q);
      this.currentPage.set(1);
      this.stateService.saveState({ searchQuery: q, currentPage: 1 });
    });
  }

  ngOnInit(): void {
    this.fetchData();

    this.route.queryParamMap.subscribe((params) => {
      if (params.get('open') === '1' || params.get('filter') === '1') {
        this.openSidebar();
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      this.stateService.saveState({ scrollPositionY: window.scrollY });
    }
  }

  // ── Sidebar Controls ──
  protected openSidebar(): void {
    this.isSidebarOpen.set(true);
  }

  protected closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  protected toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  protected fetchData(): void {
    this.isLoading.set(true);
    this.expenseService.fetchExpenses().subscribe({
      next: (res) => {
        this.expenses.set(res.data || []);
        this.isLoading.set(false);
        this.restoreScrollAndHighlight();
      },
      error: () => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load transactions', 'Error');
      },
    });

    this.expenseService.fetchCategories().subscribe({
      next: (res) => {
        if (res.data && Array.isArray(res.data)) {
          this.categories.set(res.data);
        }
      },
      error: (err) => console.error('Failed to load categories', err),
    });
  }

  private restoreScrollAndHighlight(): void {
    if (typeof window === 'undefined') return;

    setTimeout(() => {
      const lastId = this.stateService.state.lastEditedId;
      if (lastId) {
        const el = document.getElementById('txn-' + lastId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('txn-highlight');
          setTimeout(() => el.classList.remove('txn-highlight'), 3000);
          this.stateService.saveState({ lastEditedId: null });
          return;
        }
      }

      const savedY = this.stateService.state.scrollPositionY;
      if (savedY > 0) {
        window.scrollTo({ top: savedY, behavior: 'instant' });
      }
    }, 120);
  }

  // ── Data Computeds & Counts ──
  protected readonly uniqueCategories = computed(() => {
    const expenses = this.expenses();
    const map = new Map<string, number>();

    for (const cat of this.categories()) {
      map.set(cat.name, 0);
    }

    for (const exp of expenses) {
      const cat = exp.category || 'Other';
      map.set(cat, (map.get(cat) || 0) + 1);
    }

    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  });

  protected readonly uniquePaymentMethods = computed(() => {
    const expenses = this.expenses();
    const map = new Map<string, number>();

    for (const pm of this.defaultPaymentMethods) {
      map.set(pm, 0);
    }

    for (const exp of expenses) {
      const pm = exp.paymentMethod || 'Other';
      map.set(pm, (map.get(pm) || 0) + 1);
    }

    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  });

  protected readonly uniqueTags = computed(() => {
    const expenses = this.expenses();
    const map = new Map<string, number>();

    for (const exp of expenses) {
      if (exp.tags && Array.isArray(exp.tags)) {
        for (const tag of exp.tags) {
          const t = tag.trim();
          if (t) {
            map.set(t, (map.get(t) || 0) + 1);
          }
        }
      }
    }

    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  });

  protected readonly untaggedCount = computed(() => {
    return this.expenses().filter((e) => !e.tags || e.tags.length === 0).length;
  });

  // Live Counts for Field Presence
  protected readonly hasNotesCount = computed(() => this.expenses().filter((e) => !!(e.notes && e.notes.trim().length > 0)).length);
  protected readonly hasTagsCount = computed(() => this.expenses().filter((e) => e.tags && e.tags.length > 0).length);
  protected readonly hasTitleCount = computed(() => this.expenses().filter((e) => !!(e.title && e.title.trim().length > 0 && e.title.trim() !== e.merchant?.trim())).length);
  protected readonly hasMerchantCount = computed(() => this.expenses().filter((e) => !!(e.merchant && e.merchant.trim().length > 0)).length);
  protected readonly hasCategoryCount = computed(() => this.expenses().filter((e) => e.category && e.category.toLowerCase() !== 'other').length);
  protected readonly uncategorizedCount = computed(() => this.expenses().filter((e) => !e.category || e.category.toLowerCase() === 'other').length);
  
  // Live Counts for Source Tracking
  protected readonly gmailCount = computed(() => this.expenses().filter((e) => e.source === 'gmail_auto' || !!e.gmailMessageId).length);
  protected readonly manualCount = computed(() => this.expenses().filter((e) => !e.gmailMessageId && e.source !== 'gmail_auto').length);

  // Field Data Status Evaluator
  protected isFieldFilled(e: Expense, field: string): boolean {
    switch (field) {
      case 'notes':
        return !!(e.notes && e.notes.trim().length > 0);
      case 'tags':
        return !!(e.tags && e.tags.length > 0);
      case 'category':
        return !!(e.category && e.category.trim().length > 0 && e.category.toLowerCase() !== 'other');
      case 'title':
        return !!(e.title && e.title.trim().length > 0 && e.title.trim().toLowerCase() !== (e.merchant || '').trim().toLowerCase());
      case 'merchant':
        return !!(e.merchant && e.merchant.trim().length > 0);
      case 'paymentMethod':
        return !!(e.paymentMethod && e.paymentMethod.trim().length > 0 && e.paymentMethod.toLowerCase() !== 'other');
      default:
        return true;
    }
  }

  // Dynamic Count for Clean Up Fields
  protected getCleanupCount(field: string): number {
    const mode = this.cleanupMode();
    return this.expenses().filter((e) => (mode === 'missing' ? !this.isFieldFilled(e, field) : this.isFieldFilled(e, field))).length;
  }

  // ── Dynamic Filter Engine (Executing in requested order) ──
  protected readonly filteredExpenses = computed(() => {
    let list = [...this.expenses()];
    const query = this.searchQuery();
    const preset = this.datePreset();
    const customStart = this.customStartDate();
    const customEnd = this.customEndDate();
    const cats = this.selectedCategories();
    const tags = this.selectedTags();
    const untaggedOnly = this.includeUntagged();
    const sort = this.sortBy();
    const minAmt = this.amountMin();
    const maxAmt = this.amountMax();
    const timeFilter = this.timeOfDayFilter();
    const presFields = this.presentFields();
    const sFilter = this.sourceFilter();
    const pms = this.selectedPaymentMethods();
    const cFields = this.cleanupFields();
    const cMode = this.cleanupMode();
    const cMatch = this.cleanupMatch();

    // 0. Instant Search Query
    if (query) {
      list = list.filter((e) => {
        const titleMatch = (e.title || '').toLowerCase().includes(query);
        const merchantMatch = (e.merchant || '').toLowerCase().includes(query);
        const notesMatch = (e.notes || '').toLowerCase().includes(query);
        const catMatch = (e.category || '').toLowerCase().includes(query);
        const pmMatch = (e.paymentMethod || '').toLowerCase().includes(query);
        const amountMatch = (e.amount || 0).toString().includes(query);
        const tagsMatch = (e.tags || []).some((t) => t.toLowerCase().includes(query));
        return titleMatch || merchantMatch || notesMatch || catMatch || pmMatch || amountMatch || tagsMatch;
      });
    }

    // 1. Timeframe Filter
    if (preset !== 'all') {
      const now = new Date();
      let startBoundary: Date | null = null;
      let endBoundary: Date | null = null;

      if (preset === 'today') {
        startBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        endBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === 'yesterday') {
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        startBoundary = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
        endBoundary = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
      } else if (preset === 'last_7_days') {
        const past7 = new Date(now);
        past7.setDate(now.getDate() - 7);
        startBoundary = new Date(past7.getFullYear(), past7.getMonth(), past7.getDate(), 0, 0, 0, 0);
        endBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === 'this_week') {
        const dayOfWeek = now.getDay();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - dayOfWeek);
        startBoundary = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 0, 0, 0, 0);
        endBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === 'this_month') {
        startBoundary = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        endBoundary = new Date(now.getFullYear(), now.getMonth(), lastDay, 23, 59, 59, 999);
      } else if (preset === 'last_month') {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startBoundary = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1, 0, 0, 0, 0);
        const lastDay = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
        endBoundary = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), lastDay, 23, 59, 59, 999);
      } else if (preset === 'last_30_days') {
        const past30 = new Date(now);
        past30.setDate(now.getDate() - 30);
        startBoundary = new Date(past30.getFullYear(), past30.getMonth(), past30.getDate(), 0, 0, 0, 0);
        endBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (preset === 'this_quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const startQuarterMonth = currentQuarter * 3;
        startBoundary = new Date(now.getFullYear(), startQuarterMonth, 1, 0, 0, 0, 0);
        const lastQuarterDay = new Date(now.getFullYear(), startQuarterMonth + 3, 0).getDate();
        endBoundary = new Date(now.getFullYear(), startQuarterMonth + 2, lastQuarterDay, 23, 59, 59, 999);
      } else if (preset === 'this_year') {
        startBoundary = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        endBoundary = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else if (preset === 'custom') {
        if (customStart) {
          const [sy, sm, sd] = customStart.split('-').map(Number);
          startBoundary = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        }
        if (customEnd) {
          const [ey, em, ed] = customEnd.split('-').map(Number);
          endBoundary = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        }
      }

      list = list.filter((e) => {
        const itemDate = new Date(e.date).getTime();
        if (startBoundary && itemDate < startBoundary.getTime()) return false;
        if (endBoundary && itemDate > endBoundary.getTime()) return false;
        return true;
      });
    }

    // 2. Category Filter
    if (cats.length > 0) {
      const catLowerSet = new Set(cats.map((c) => c.toLowerCase()));
      list = list.filter((e) => catLowerSet.has((e.category || 'Other').toLowerCase()));
    }

    // 3. Tags Filter
    if (untaggedOnly) {
      list = list.filter((e) => !e.tags || e.tags.length === 0);
    } else if (tags.length > 0) {
      const tagLowerSet = new Set(tags.map((t) => t.toLowerCase()));
      list = list.filter((e) => (e.tags || []).some((t) => tagLowerSet.has(t.toLowerCase())));
    }

    // 4. Amount Range Filter
    if (minAmt !== null && !isNaN(minAmt)) {
      list = list.filter((e) => (e.amount || 0) >= minAmt);
    }
    if (maxAmt !== null && !isNaN(maxAmt)) {
      list = list.filter((e) => (e.amount || 0) <= maxAmt);
    }



    // 6. Time of Day Filter
    if (timeFilter !== 'all') {
      list = list.filter((e) => {
        const h = new Date(e.date).getHours();
        if (timeFilter === 'morning') return h >= 6 && h < 12;
        if (timeFilter === 'afternoon') return h >= 12 && h < 17;
        if (timeFilter === 'evening') return h >= 17 && h < 21;
        if (timeFilter === 'night') return h >= 21 || h < 6;
        return true;
      });
    }

    // 7. Input Field Presence Filters (Title, Merchant, Category, Tags, Notes, PaymentMethod)
    if (presFields.length > 0) {
      list = list.filter((e) => {
        for (const field of presFields) {
          if (field === 'title' && !(e.title && e.title.trim().length > 0 && e.title.trim() !== e.merchant?.trim())) return false;
          if (field === 'merchant' && !(e.merchant && e.merchant.trim().length > 0)) return false;
          if (field === 'category' && !(e.category && e.category.toLowerCase() !== 'other')) return false;
          if (field === 'tags' && !(e.tags && e.tags.length > 0)) return false;
          if (field === 'notes' && !(e.notes && e.notes.trim().length > 0)) return false;
          if (field === 'paymentMethod' && !(e.paymentMethod && e.paymentMethod.toLowerCase() !== 'other')) return false;
        }
        return true;
      });
    }



    // 9. Source Filter (Gmail sync vs Manual)
    if (sFilter === 'gmail_synced') {
      list = list.filter((e) => e.source === 'gmail_auto' || !!e.gmailMessageId);
    } else if (sFilter === 'manual') {
      list = list.filter((e) => !e.gmailMessageId && e.source !== 'gmail_auto');
    }

    // 10. Payment Methods Filter
    if (pms.length > 0) {
      const pmLowerSet = new Set(pms.map((p) => p.toLowerCase()));
      list = list.filter((e) => pmLowerSet.has((e.paymentMethod || 'Other').toLowerCase()));
    }

    // 11. Clean Up Filter (Last Filter Section)
    if (cFields.length > 0) {
      list = list.filter((e) => {
        if (cMatch === 'all') {
          return cFields.every((f) => (cMode === 'missing' ? !this.isFieldFilled(e, f) : this.isFieldFilled(e, f)));
        } else {
          return cFields.some((f) => (cMode === 'missing' ? !this.isFieldFilled(e, f) : this.isFieldFilled(e, f)));
        }
      });
    }

    // 11. Sorting
    list.sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      const aAmt = a.amount || 0;
      const bAmt = b.amount || 0;
      const aTitle = (a.title || a.merchant || '').toLowerCase();
      const bTitle = (b.title || b.merchant || '').toLowerCase();
      const aCat = (a.category || '').toLowerCase();
      const bCat = (b.category || '').toLowerCase();

      switch (sort) {
        case 'date_desc':
          return bTime - aTime;
        case 'date_asc':
          return aTime - bTime;
        case 'amount_desc':
          return bAmt - aAmt;
        case 'amount_asc':
          return aAmt - bAmt;
        case 'title_asc':
          return aTitle.localeCompare(bTitle);
        case 'title_desc':
          return bTitle.localeCompare(aTitle);
        case 'category_asc':
          return aCat.localeCompare(bCat) || bTime - aTime;
        case 'category_desc':
          return bCat.localeCompare(aCat) || bTime - aTime;
        default:
          return bTime - aTime;
      }
    });

    return list;
  });

  // ── Metrics & Summary Computeds ──
  protected readonly totalFilteredCount = computed(() => this.filteredExpenses().length);

  protected readonly totalFilteredAmount = computed(() => {
    return this.filteredExpenses().reduce((sum, item) => sum + (item.amount || 0), 0);
  });

  protected readonly avgFilteredAmount = computed(() => {
    const count = this.totalFilteredCount();
    return count > 0 ? this.totalFilteredAmount() / count : 0;
  });

  protected readonly maxFilteredAmount = computed(() => {
    const list = this.filteredExpenses();
    if (list.length === 0) return 0;
    return Math.max(...list.map((e) => e.amount || 0));
  });

  protected readonly categorySpendBreakdown = computed(() => {
    const list = this.filteredExpenses();
    const total = this.totalFilteredAmount();
    if (total === 0 || list.length === 0) return [];

    const map = new Map<string, number>();
    for (const exp of list) {
      const cat = exp.category || 'Other';
      map.set(cat, (map.get(cat) || 0) + (exp.amount || 0));
    }

    const colorPalette = ['#06B6D4', '#F59E0B', '#EC4899', '#38BDF8', '#10B981', '#A855F7', '#F43F5E', '#8B5CF6'];

    return Array.from(map.entries())
      .map(([name, amount], idx) => ({
        name,
        amount,
        percentage: Math.round((amount / total) * 100),
        color: colorPalette[idx % colorPalette.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  });

  // ── Active Filter Badges ──
  protected readonly activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    // Search query
    if (this.searchQuery()) {
      chips.push({
        id: 'search',
        type: 'search',
        label: `"${this.searchQuery()}"`,
      });
    }

    // Timeframe
    const dp = this.datePreset();
    if (dp !== 'all') {
      const labelMap: Record<DatePreset, string> = {
        all: 'All Time',
        today: 'Today',
        yesterday: 'Yesterday',
        last_7_days: 'Last 7 Days',
        this_week: 'This Week',
        this_month: 'This Month',
        last_month: 'Last Month',
        last_30_days: 'Last 30 Days',
        this_quarter: 'This Quarter',
        this_year: 'This Year',
        custom: `${this.customStartDate() || 'Start'} to ${this.customEndDate() || 'End'}`,
      };
      chips.push({
        id: 'date',
        type: 'date',
        label: labelMap[dp],
      });
    }

    // Categories
    for (const cat of this.selectedCategories()) {
      chips.push({
        id: `cat_${cat}`,
        type: 'category',
        label: cat,
        value: cat,
      });
    }

    // Tags
    if (this.includeUntagged()) {
      chips.push({
        id: 'tag_untagged',
        type: 'tag',
        label: 'Untagged Only',
        value: '__untagged__',
      });
    }
    for (const tag of this.selectedTags()) {
      chips.push({
        id: `tag_${tag}`,
        type: 'tag',
        label: `#${tag}`,
        value: tag,
      });
    }

    // Amount range
    const ap = this.amountPreset();
    const min = this.amountMin();
    const max = this.amountMax();
    if (ap !== 'all' || min !== null || max !== null) {
      let amtLabel = '';
      if (min !== null && max !== null) amtLabel = `₹${min} – ₹${max}`;
      else if (min !== null) amtLabel = `≥ ₹${min}`;
      else if (max !== null) amtLabel = `≤ ₹${max}`;

      if (amtLabel) {
        chips.push({
          id: 'amount',
          type: 'amount',
          label: amtLabel,
        });
      }
    }



    // Time of Day
    const tod = this.timeOfDayFilter();
    if (tod !== 'all') {
      const todLabels: Record<TimeOfDayFilter, string> = {
        all: '',
        morning: 'Morning (6AM–12PM)',
        afternoon: 'Afternoon (12PM–5PM)',
        evening: 'Evening (5PM–9PM)',
        night: 'Night (9PM–6AM)',
      };
      chips.push({
        id: 'time',
        type: 'time',
        label: todLabels[tod],
      });
    }

    // Present Fields
    const fieldLabelMap: Record<string, string> = {
      title: 'Has Title',
      merchant: 'Has Merchant',
      category: 'Categorized',
      tags: 'Has Tags',
      notes: 'Has Notes',
      paymentMethod: 'Has Payment Method',
    };
    for (const f of this.presentFields()) {
      chips.push({
        id: `pres_${f}`,
        type: 'field',
        label: `✓ ${fieldLabelMap[f] || f}`,
        value: `pres_${f}`,
      });
    }



    // Source & Edit Tracking
    const src = this.sourceFilter();
    if (src !== 'all') {
      const srcLabels: Record<SourceFilter, string> = {
        all: '',
        gmail_synced: '✉️ Gmail Synced',
        manual: '👤 Manually Added',
      };
      chips.push({
        id: 'source',
        type: 'source',
        label: srcLabels[src],
      });
    }

    // Payment methods
    for (const pm of this.selectedPaymentMethods()) {
      chips.push({
        id: `pm_${pm}`,
        type: 'payment',
        label: pm,
        value: pm,
      });
    }

    // Clean Up Chips
    const curCMode = this.cleanupMode();
    for (const f of this.cleanupFields()) {
      const def = this.cleanupFieldDefinitions.find((item) => item.id === f);
      const labelText = def ? (curCMode === 'missing' ? def.missingLabel : def.presentLabel) : f;
      chips.push({
        id: `cleanup_${f}`,
        type: 'cleanup',
        label: curCMode === 'missing' ? `✗ ${labelText}` : `✓ ${labelText}`,
        value: f,
      });
    }

    return chips;
  });

  protected readonly activeFilterCount = computed(() => this.activeFilterChips().length);
  protected readonly hasActiveFilters = computed(() => this.activeFilterChips().length > 0);

  // ── Pagination Computeds ──
  protected readonly totalPages = computed(() => {
    const total = this.totalFilteredCount();
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  protected readonly paginatedExpenses = computed(() => {
    const list = this.filteredExpenses();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  // ── 1. Timeframe Actions ──
  protected setDatePreset(preset: DatePreset): void {
    this.datePreset.set(preset);
    this.currentPage.set(1);
    this.stateService.saveState({ datePreset: preset, currentPage: 1 });
  }

  protected onCustomStartDateChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.customStartDate.set(target.value);
    this.datePreset.set('custom');
    this.currentPage.set(1);
    this.stateService.saveState({ customStartDate: target.value, datePreset: 'custom', currentPage: 1 });
  }

  protected onCustomEndDateChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.customEndDate.set(target.value);
    this.datePreset.set('custom');
    this.currentPage.set(1);
    this.stateService.saveState({ customEndDate: target.value, datePreset: 'custom', currentPage: 1 });
  }

  // ── 2. Category Actions ──
  protected toggleCategory(categoryName: string): void {
    const current = this.selectedCategories();
    const exists = current.includes(categoryName);
    const updated = exists ? current.filter((c) => c !== categoryName) : [...current, categoryName];
    this.selectedCategories.set(updated);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedCategories: updated, currentPage: 1 });
  }

  protected clearCategoryFilter(): void {
    this.selectedCategories.set([]);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedCategories: [], currentPage: 1 });
  }

  protected selectAllCategories(): void {
    const all = this.uniqueCategories().map((c) => c.name);
    this.selectedCategories.set(all);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedCategories: all, currentPage: 1 });
  }

  // ── 3. Tags Actions ──
  protected toggleTag(tag: string): void {
    if (this.includeUntagged()) {
      this.includeUntagged.set(false);
    }
    const current = this.selectedTags();
    const exists = current.includes(tag);
    const updated = exists ? current.filter((t) => t !== tag) : [...current, tag];
    this.selectedTags.set(updated);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedTags: updated, includeUntagged: false, currentPage: 1 });
  }

  protected toggleUntaggedOnly(): void {
    const next = !this.includeUntagged();
    this.includeUntagged.set(next);
    if (next) {
      this.selectedTags.set([]);
    }
    this.currentPage.set(1);
    this.stateService.saveState({ includeUntagged: next, selectedTags: next ? [] : this.selectedTags(), currentPage: 1 });
  }

  protected clearTagFilter(): void {
    this.selectedTags.set([]);
    this.includeUntagged.set(false);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedTags: [], includeUntagged: false, currentPage: 1 });
  }

  // ── 4. Sort Actions ──
  protected setSortBy(option: SortOption): void {
    this.sortBy.set(option);
    this.currentPage.set(1);
    this.stateService.saveState({ sortBy: option, currentPage: 1 });
  }

  // ── 5. Remaining Filter Actions ──
  protected setAmountPreset(preset: AmountPreset): void {
    this.amountPreset.set(preset);
    this.currentPage.set(1);

    let min: number | null = null;
    let max: number | null = null;

    switch (preset) {
      case 'all':
        min = null;
        max = null;
        break;
      case 'under_500':
        min = null;
        max = 500;
        break;
      case '500_2000':
        min = 500;
        max = 2000;
        break;
      case '2000_5000':
        min = 2000;
        max = 5000;
        break;
      case '5000_10000':
        min = 5000;
        max = 10000;
        break;
      case 'above_10000':
        min = 10000;
        max = null;
        break;
      case 'custom':
        min = this.amountMin();
        max = this.amountMax();
        break;
    }

    this.amountMin.set(min);
    this.amountMax.set(max);
    this.stateService.saveState({ amountPreset: preset, amountMin: min, amountMax: max, currentPage: 1 });
  }

  protected onAmountMinInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = target.value ? parseFloat(target.value) : null;
    this.amountMin.set(val);
    this.amountPreset.set('custom');
    this.currentPage.set(1);
    this.stateService.saveState({ amountMin: val, amountPreset: 'custom', currentPage: 1 });
  }

  protected onAmountMaxInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = target.value ? parseFloat(target.value) : null;
    this.amountMax.set(val);
    this.amountPreset.set('custom');
    this.currentPage.set(1);
    this.stateService.saveState({ amountMax: val, amountPreset: 'custom', currentPage: 1 });
  }



  protected setTimeOfDayFilter(filter: TimeOfDayFilter): void {
    this.timeOfDayFilter.set(filter);
    this.currentPage.set(1);
    this.stateService.saveState({ timeOfDayFilter: filter, currentPage: 1 });
  }

  // Field Presence Actions
  protected togglePresentField(field: string): void {
    const current = this.presentFields();
    const exists = current.includes(field);
    const updated = exists ? current.filter((f) => f !== field) : [...current, field];
    this.presentFields.set(updated);
    this.currentPage.set(1);
    this.stateService.saveState({ presentFields: updated, currentPage: 1 });
  }

  protected clearFieldPresenceFilter(): void {
    this.presentFields.set([]);
    this.currentPage.set(1);
    this.stateService.saveState({ presentFields: [], currentPage: 1 });
  }

  protected setSourceFilter(filter: SourceFilter): void {
    this.sourceFilter.set(filter);
    this.currentPage.set(1);
    this.stateService.saveState({ sourceFilter: filter, currentPage: 1 });
  }

  // ── 6. Payment Method Actions ──
  protected togglePaymentMethod(method: string): void {
    const current = this.selectedPaymentMethods();
    const exists = current.includes(method);
    const updated = exists ? current.filter((p) => p !== method) : [...current, method];
    this.selectedPaymentMethods.set(updated);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedPaymentMethods: updated, currentPage: 1 });
  }

  protected clearPaymentFilter(): void {
    this.selectedPaymentMethods.set([]);
    this.currentPage.set(1);
    this.stateService.saveState({ selectedPaymentMethods: [], currentPage: 1 });
  }

  // ── Clean Up Actions ──
  protected toggleCleanupField(field: string): void {
    const current = this.cleanupFields();
    const exists = current.includes(field);
    const updated = exists ? current.filter((f) => f !== field) : [...current, field];
    this.cleanupFields.set(updated);
    this.currentPage.set(1);
    this.stateService.saveState({ cleanupFields: updated, currentPage: 1 });
  }

  protected setCleanupMode(mode: 'missing' | 'present'): void {
    this.cleanupMode.set(mode);
    this.currentPage.set(1);
    this.stateService.saveState({ cleanupMode: mode, currentPage: 1 });
  }

  protected setCleanupMatch(match: 'any' | 'all'): void {
    this.cleanupMatch.set(match);
    this.currentPage.set(1);
    this.stateService.saveState({ cleanupMatch: match, currentPage: 1 });
  }

  protected clearCleanupFilter(): void {
    this.cleanupFields.set([]);
    this.currentPage.set(1);
    this.stateService.saveState({ cleanupFields: [], currentPage: 1 });
  }

  // ── Badge Dismiss & Reset ──
  protected removeFilter(chip: ActiveFilterChip): void {
    switch (chip.type) {
      case 'search':
        this.searchControl.setValue('');
        this.stateService.saveState({ searchQuery: '' });
        break;
      case 'date':
        this.datePreset.set('all');
        this.customStartDate.set('');
        this.customEndDate.set('');
        this.stateService.saveState({ datePreset: 'all', customStartDate: '', customEndDate: '' });
        break;
      case 'category':
        if (chip.value) {
          const updated = this.selectedCategories().filter((c) => c !== chip.value);
          this.selectedCategories.set(updated);
          this.stateService.saveState({ selectedCategories: updated });
        }
        break;
      case 'tag':
        if (chip.value === '__untagged__') {
          this.includeUntagged.set(false);
          this.stateService.saveState({ includeUntagged: false });
        } else if (chip.value) {
          const updated = this.selectedTags().filter((t) => t !== chip.value);
          this.selectedTags.set(updated);
          this.stateService.saveState({ selectedTags: updated });
        }
        break;
      case 'amount':
        this.amountPreset.set('all');
        this.amountMin.set(null);
        this.amountMax.set(null);
        this.stateService.saveState({ amountPreset: 'all', amountMin: null, amountMax: null });
        break;

      case 'time':
        this.timeOfDayFilter.set('all');
        this.stateService.saveState({ timeOfDayFilter: 'all' });
        break;
      case 'field':
        if (chip.value?.startsWith('pres_')) {
          const f = chip.value.replace('pres_', '');
          const updated = this.presentFields().filter((item) => item !== f);
          this.presentFields.set(updated);
          this.stateService.saveState({ presentFields: updated });
        }
        break;
      case 'source':
        this.sourceFilter.set('all');
        this.stateService.saveState({ sourceFilter: 'all' });
        break;
      case 'payment':
        if (chip.value) {
          const updated = this.selectedPaymentMethods().filter((p) => p !== chip.value);
          this.selectedPaymentMethods.set(updated);
          this.stateService.saveState({ selectedPaymentMethods: updated });
        }
        break;
      case 'cleanup':
        if (chip.value) {
          const updated = this.cleanupFields().filter((f) => f !== chip.value);
          this.cleanupFields.set(updated);
          this.stateService.saveState({ cleanupFields: updated });
        }
        break;
    }
    this.currentPage.set(1);
    this.stateService.saveState({ currentPage: 1 });
  }

  protected resetAllFilters(): void {
    this.searchControl.setValue('');
    this.datePreset.set('all');
    this.customStartDate.set('');
    this.customEndDate.set('');
    this.selectedCategories.set([]);
    this.selectedTags.set([]);
    this.includeUntagged.set(false);
    this.sortBy.set('date_desc');
    this.amountPreset.set('all');
    this.amountMin.set(null);
    this.amountMax.set(null);
    this.timeOfDayFilter.set('all');
    this.presentFields.set([]);
    this.sourceFilter.set('all');
    this.selectedPaymentMethods.set([]);
    this.cleanupFields.set([]);
    this.cleanupMode.set('missing');
    this.cleanupMatch.set('any');
    this.currentPage.set(1);
    this.stateService.resetState();
    this.notificationService.info('All filters have been reset', 'Filters Reset');
  }

  // ── Pagination Actions ──
  protected goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.stateService.saveState({ currentPage: page });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  protected prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  protected nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  protected onPageSizeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const size = parseInt(target.value, 10);
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.stateService.saveState({ pageSize: size, currentPage: 1 });
  }

  // ── Continuous In-Place Edit Actions ──
  protected openQuickEdit(exp: Expense): void {
    this.editingExpense.set(exp);
    this.editAmount.set(exp.amount);
    this.editTitle.set(exp.title || '');
    this.editMerchant.set(exp.merchant || '');
    this.editCategory.set(exp.category || 'Other');
    this.editPaymentMethod.set(exp.paymentMethod || 'UPI');
    this.editNotes.set(exp.notes || '');
    this.editTags.set([...(exp.tags || [])]);
    this.editTagInput.set('');

    const d = exp.date ? new Date(exp.date) : new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    this.editDate.set(localIso);
  }

  protected closeQuickEdit(): void {
    this.editingExpense.set(null);
  }

  protected addEditTag(): void {
    const tag = this.editTagInput().trim();
    if (tag && !this.editTags().includes(tag)) {
      this.editTags.update((tags) => [...tags, tag]);
    }
    this.editTagInput.set('');
  }

  protected removeEditTag(tag: string): void {
    this.editTags.update((tags) => tags.filter((t) => t !== tag));
  }

  protected saveQuickEdit(): void {
    const exp = this.editingExpense();
    if (!exp) return;

    const amt = this.editAmount();
    if (amt === null || isNaN(amt) || amt <= 0) {
      this.notificationService.error('Please enter a valid amount', 'Validation');
      return;
    }

    const title = this.editTitle().trim() || this.editMerchant().trim() || 'Expense';
    const merchant = this.editMerchant().trim() || title;

    if (this.editTagInput().trim()) {
      this.addEditTag();
    }

    const payload: ExpensePayload = {
      amount: amt,
      title,
      merchant,
      category: this.editCategory().trim() || 'Other',
      paymentMethod: this.editPaymentMethod() || 'UPI',
      date: new Date(this.editDate()).toISOString(),
      tags: this.editTags(),
      notes: this.editNotes().trim(),
    };

    this.isSavingEdit.set(true);
    this.expenseService.updateExpense(exp._id, payload).subscribe({
      next: (res) => {
        const updated = res.data || { ...exp, ...payload, isManuallyEdited: true };
        this.expenses.update((list) =>
          list.map((item) => (item._id === exp._id ? { ...item, ...updated, isManuallyEdited: true, _id: exp._id } : item))
        );
        this.stateService.saveState({ lastEditedId: exp._id });
        this.isSavingEdit.set(false);
        this.closeQuickEdit();
        this.notificationService.success('Transaction updated in-place.', 'Updated');

        setTimeout(() => {
          const el = document.getElementById('txn-' + exp._id);
          if (el) {
            el.classList.add('txn-highlight');
            setTimeout(() => el.classList.remove('txn-highlight'), 2500);
          }
        }, 100);
      },
      error: (err) => {
        this.isSavingEdit.set(false);
        this.notificationService.error(
          err?.error?.message || 'Failed to update transaction',
          'Error'
        );
      },
    });
  }

  protected openFullEdit(id: string): void {
    if (typeof window !== 'undefined') {
      this.stateService.saveState({ lastEditedId: id, scrollPositionY: window.scrollY });
    }
    this.closeQuickEdit();
    this.router.navigate(['/expenses/edit', id]);
  }

  // ── Delete Actions ──
  protected promptDelete(id: string): void {
    this.deleteConfirmId.set(id);
  }

  protected cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  protected confirmDelete(id: string): void {
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

  // ── CSV Export Engine ──
  protected exportToCsv(): void {
    const items = this.filteredExpenses();
    if (items.length === 0) {
      this.notificationService.warning('No transactions available to export', 'Export Notice');
      return;
    }

    const headers = ['Date', 'Time', 'Title', 'Merchant', 'Amount (INR)', 'Category', 'Payment Method', 'Source', 'Edited', 'Tags', 'Notes'];
    const rows = items.map((e) => {
      const d = new Date(e.date);
      const dateStr = d.toISOString().split('T')[0];
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const escape = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
      const srcStr = e.source === 'gmail_auto' || e.gmailMessageId ? 'Gmail Sync' : 'Manual';
      const editedStr = e.isManuallyEdited ? 'Yes' : 'No';

      return [
        dateStr,
        timeStr,
        escape(e.title || ''),
        escape(e.merchant || ''),
        (e.amount || 0).toFixed(2),
        escape(e.category || 'Other'),
        escape(e.paymentMethod || 'UPI'),
        srcStr,
        editedStr,
        escape((e.tags || []).join('; ')),
        escape(e.notes || ''),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const nowStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions-export-${nowStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.notificationService.success(`Exported ${items.length} transactions to CSV`, 'Export Successful');
  }
}
