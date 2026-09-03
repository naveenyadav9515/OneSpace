import { Injectable } from '@angular/core';

export type DatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export type AmountPreset =
  | 'all'
  | 'under_500'
  | '500_2000'
  | '2000_5000'
  | '5000_10000'
  | 'above_10000'
  | 'custom';

export type SortOption =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'title_asc'
  | 'title_desc'
  | 'category_asc'
  | 'category_desc';

export type TimeOfDayFilter = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
export type SourceFilter = 'all' | 'gmail_synced' | 'manual';

export interface ExpenseFilterPersistedState {
  searchQuery: string;
  datePreset: DatePreset;
  customStartDate: string;
  customEndDate: string;
  selectedCategories: string[];
  selectedTags: string[];
  includeUntagged: boolean;
  sortBy: SortOption;
  amountPreset: AmountPreset;
  amountMin: number | null;
  amountMax: number | null;
  timeOfDayFilter: TimeOfDayFilter;
  presentFields: string[]; // e.g. 'title', 'merchant', 'category', 'tags', 'notes', 'paymentMethod'
  sourceFilter: SourceFilter;
  selectedPaymentMethods: string[];
  cleanupFields: string[]; // e.g. 'notes', 'tags', 'category', 'title', 'merchant', 'paymentMethod'
  cleanupMode: 'missing' | 'present';
  cleanupMatch: 'any' | 'all';
  currentPage: number;
  pageSize: number;
  isFilterPanelExpanded: boolean;
  scrollPositionY: number;
  lastEditedId: string | null;
}

const DEFAULT_FILTER_STATE: ExpenseFilterPersistedState = {
  searchQuery: '',
  datePreset: 'all',
  customStartDate: '',
  customEndDate: '',
  selectedCategories: [],
  selectedTags: [],
  includeUntagged: false,
  sortBy: 'date_desc',
  amountPreset: 'all',
  amountMin: null,
  amountMax: null,
  timeOfDayFilter: 'all',
  presentFields: [],
  sourceFilter: 'all',
  selectedPaymentMethods: [],
  cleanupFields: [],
  cleanupMode: 'missing',
  cleanupMatch: 'any',
  currentPage: 1,
  pageSize: 15,
  isFilterPanelExpanded: true,
  scrollPositionY: 0,
  lastEditedId: null,
};

@Injectable({
  providedIn: 'root',
})
export class ExpenseFilterStateService {
  private readonly STORAGE_KEY = 'onespace_expense_filter_state';

  public state: ExpenseFilterPersistedState;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): ExpenseFilterPersistedState {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...DEFAULT_FILTER_STATE, ...parsed };
        }
      }
    } catch (e) {
      console.warn('Failed to load filter state from sessionStorage', e);
    }
    return { ...DEFAULT_FILTER_STATE };
  }

  public saveState(updates: Partial<ExpenseFilterPersistedState>): void {
    this.state = { ...this.state, ...updates };
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.warn('Failed to save filter state to sessionStorage', e);
    }
  }

  public resetState(): void {
    this.state = { ...DEFAULT_FILTER_STATE };
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to clear filter state from sessionStorage', e);
    }
  }
}
