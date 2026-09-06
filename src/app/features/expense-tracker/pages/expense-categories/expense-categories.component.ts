import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import { ExpenseService, CustomCategory, Expense } from '@core/services/expense.service';
import { NotificationService } from '@core/services/notification.service';

const FALLBACK_CATEGORY = 'Other';

export interface CategoryIconItem {
  name: string;
  label: string;
  group: string;
}

export const CATEGORY_ICON_GROUPS = [
  'All',
  'Food & Drinks',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Health & Fitness',
  'Home & Family',
  'Finance & Work',
  'General',
] as const;

export const CATEGORY_ICON_MAP: Record<string, string> = {
  'bl-home': 'cottage',
  'bills and rents': 'receipt_long',
  'credit card expenses': 'credit_card',
  'friends and meet-ups': 'groups',
  'kitchen utilities': 'kitchen',
  'miscellaneous expenses': 'widgets',
  office: 'business_center',
  'outside food': 'restaurant',
  parties: 'celebration',
  'previous month expenses': 'history',
  'relatives and gifts': 'redeem',
  bike: 'two_wheeler',
  naveen: 'person',
  sowji: 'face_3',
  'our expenses': 'favorite',
  health: 'medical_services',
  'our plans': 'event_upcoming',
  exceptional: 'emergency',
  helping: 'volunteer_activism',
  other: 'category',
  // Common variants
  'food & dining': 'restaurant',
  food: 'restaurant',
  transport: 'directions_car',
  shopping: 'local_mall',
  utilities: 'bolt',
  entertainment: 'movie',
  groceries: 'shopping_basket',
  rent: 'home',
  travel: 'flight',
  education: 'school',
  investments: 'trending_up',
  savings: 'savings',
  personal: 'person',
};

export const CATEGORY_TONE_MAP: Record<string, string> = {
  'bl-home': 'tone-indigo',
  'bills and rents': 'tone-amber',
  'credit card expenses': 'tone-purple',
  'friends and meet-ups': 'tone-teal',
  'kitchen utilities': 'tone-orange',
  'miscellaneous expenses': 'tone-slate',
  office: 'tone-cyan',
  'outside food': 'tone-orange',
  parties: 'tone-fuchsia',
  'previous month expenses': 'tone-slate',
  'relatives and gifts': 'tone-pink',
  bike: 'tone-cyan',
  naveen: 'tone-indigo',
  sowji: 'tone-pink',
  'our expenses': 'tone-rose',
  health: 'tone-green',
  'our plans': 'tone-emerald',
  exceptional: 'tone-amber',
  helping: 'tone-teal',
  other: 'tone-slate',
};

export const CATEGORY_ICONS: CategoryIconItem[] = [
  // Food & Drinks
  { name: 'restaurant', label: 'Restaurant / Dine out', group: 'Food & Drinks' },
  { name: 'local_cafe', label: 'Coffee & Cafe', group: 'Food & Drinks' },
  { name: 'fastfood', label: 'Fast Food / Snacks', group: 'Food & Drinks' },
  { name: 'takeout_dining', label: 'Food Delivery / Zomato', group: 'Food & Drinks' },
  { name: 'local_pizza', label: 'Pizza & Fast Bites', group: 'Food & Drinks' },
  { name: 'bakery_dining', label: 'Bakery & Sweets', group: 'Food & Drinks' },
  { name: 'lunch_dining', label: 'Lunch / Thali', group: 'Food & Drinks' },
  { name: 'ramen_dining', label: 'Noodles & Asian', group: 'Food & Drinks' },
  { name: 'icecream', label: 'Desserts & Shakes', group: 'Food & Drinks' },
  { name: 'shopping_basket', label: 'Groceries / Mart', group: 'Food & Drinks' },
  { name: 'kitchen', label: 'Kitchen Utilities', group: 'Food & Drinks' },
  { name: 'skillet', label: 'Cooking & Cookware', group: 'Food & Drinks' },
  { name: 'local_bar', label: 'Bar & Pubs', group: 'Food & Drinks' },
  { name: 'liquor', label: 'Alcohol & Drinks', group: 'Food & Drinks' },
  { name: 'water_drop', label: 'Water & Beverages', group: 'Food & Drinks' },

  // Transport
  { name: 'two_wheeler', label: 'Bike / Scooter', group: 'Transport' },
  { name: 'directions_car', label: 'Car / Driving', group: 'Transport' },
  { name: 'local_gas_station', label: 'Fuel & Petrol', group: 'Transport' },
  { name: 'local_taxi', label: 'Cab / Uber / Ola', group: 'Transport' },
  { name: 'directions_bus', label: 'Bus & Transit', group: 'Transport' },
  { name: 'directions_subway', label: 'Train & Metro', group: 'Transport' },
  { name: 'flight', label: 'Flight & Air Travel', group: 'Transport' },
  { name: 'commute', label: 'Daily Commute', group: 'Transport' },
  { name: 'pedal_bike', label: 'Bicycle / Rental', group: 'Transport' },
  { name: 'electric_car', label: 'EV Charging', group: 'Transport' },
  { name: 'car_repair', label: 'Vehicle Service & Repair', group: 'Transport' },
  { name: 'local_parking', label: 'Parking & Fastag Tolls', group: 'Transport' },

  // Home & Utilities
  { name: 'cottage', label: 'BL-Home / Stay', group: 'Home & Family' },
  { name: 'home', label: 'House Rent & Living', group: 'Home & Family' },
  { name: 'home_pin', label: 'Base Location', group: 'Home & Family' },
  { name: 'receipt_long', label: 'Bills & Invoices', group: 'Bills & Utilities' },
  { name: 'bolt', label: 'Electricity Bill', group: 'Bills & Utilities' },
  { name: 'wifi', label: 'Wi-Fi & Broadband', group: 'Bills & Utilities' },
  { name: 'phone_android', label: 'Mobile Recharge', group: 'Bills & Utilities' },
  { name: 'tv', label: 'DTH / TV / Cable', group: 'Bills & Utilities' },
  { name: 'chair', label: 'Furniture & Decor', group: 'Home & Family' },
  { name: 'bed', label: 'Bedroom & Stay', group: 'Home & Family' },
  { name: 'cleaning_services', label: 'Cleaning & Housekeeping', group: 'Home & Family' },
  { name: 'plumbing', label: 'Maintenance & Repairs', group: 'Home & Family' },
  { name: 'pets', label: 'Pet Supplies & Vet', group: 'Home & Family' },
  { name: 'yard', label: 'Balcony & Garden', group: 'Home & Family' },

  // Shopping & Lifestyle
  { name: 'local_mall', label: 'Shopping Mall', group: 'Shopping' },
  { name: 'shopping_cart', label: 'Shopping Cart', group: 'Shopping' },
  { name: 'shopping_bag', label: 'Retail Shopping', group: 'Shopping' },
  { name: 'checkroom', label: 'Clothing & Apparel', group: 'Shopping' },
  { name: 'storefront', label: 'Store / Local Shop', group: 'Shopping' },
  { name: 'diamond', label: 'Jewelry & Gold', group: 'Shopping' },
  { name: 'card_giftcard', label: 'Gift Voucher / Cards', group: 'Shopping' },
  { name: 'redeem', label: 'Relatives & Gifts', group: 'Shopping' },
  { name: 'sell', label: 'Deals & Discounts', group: 'Shopping' },
  { name: 'spa', label: 'Salon & Grooming', group: 'Shopping' },
  { name: 'brush', label: 'Cosmetics & Beauty', group: 'Shopping' },
  { name: 'inventory_2', label: 'Online Deliveries', group: 'Shopping' },

  // Entertainment & Leisure
  { name: 'celebration', label: 'Parties & Events', group: 'Entertainment' },
  { name: 'nightlife', label: 'Nightlife & Outing', group: 'Entertainment' },
  { name: 'movie', label: 'Movies & Cinema', group: 'Entertainment' },
  { name: 'sports_esports', label: 'Gaming & Apps', group: 'Entertainment' },
  { name: 'theater_comedy', label: 'Shows & Comedy', group: 'Entertainment' },
  { name: 'music_note', label: 'Music & Concerts', group: 'Entertainment' },
  { name: 'sports_soccer', label: 'Sports & Turf', group: 'Entertainment' },
  { name: 'attractions', label: 'Amusement & Fun', group: 'Entertainment' },
  { name: 'stadium', label: 'Live Matches & IPL', group: 'Entertainment' },
  { name: 'casino', label: 'Gaming & Contests', group: 'Entertainment' },

  // Health & Fitness
  { name: 'medical_services', label: 'Health & Doctor', group: 'Health & Fitness' },
  { name: 'health_and_safety', label: 'Healthcare & First Aid', group: 'Health & Fitness' },
  { name: 'medication', label: 'Pharmacy & Medicines', group: 'Health & Fitness' },
  { name: 'fitness_center', label: 'Gym & Fitness', group: 'Health & Fitness' },
  { name: 'sports_gymnastics', label: 'Yoga & Exercise', group: 'Health & Fitness' },
  { name: 'self_improvement', label: 'Wellness & Therapy', group: 'Health & Fitness' },
  { name: 'local_hospital', label: 'Hospital & Clinic', group: 'Health & Fitness' },
  { name: 'dentistry', label: 'Dental Care', group: 'Health & Fitness' },
  { name: 'visibility', label: 'Eye Care & Specs', group: 'Health & Fitness' },

  // People & Social
  { name: 'person', label: 'Naveen / Personal', group: 'Home & Family' },
  { name: 'face_3', label: 'Sowji / Personal', group: 'Home & Family' },
  { name: 'favorite', label: 'Our Expenses / Couple', group: 'Home & Family' },
  { name: 'groups', label: 'Friends & Meet-ups', group: 'Home & Family' },
  { name: 'family_restroom', label: 'Family Expenses', group: 'Home & Family' },
  { name: 'diversity_3', label: 'Relatives & Kin', group: 'Home & Family' },
  { name: 'child_friendly', label: 'Baby & Childcare', group: 'Home & Family' },
  { name: 'volunteer_activism', label: 'Helping & Charity', group: 'Home & Family' },
  { name: 'handshake', label: 'Lending & Support', group: 'Home & Family' },

  // Work & Tech
  { name: 'business_center', label: 'Office & Work', group: 'Finance & Work' },
  { name: 'work', label: 'Job & Employment', group: 'Finance & Work' },
  { name: 'domain', label: 'Company / Corporate', group: 'Finance & Work' },
  { name: 'laptop_mac', label: 'Laptops & Gadgets', group: 'Finance & Work' },
  { name: 'devices', label: 'Electronics & Tech', group: 'Finance & Work' },
  { name: 'school', label: 'Education & Fees', group: 'Finance & Work' },
  { name: 'menu_book', label: 'Books & Courses', group: 'Finance & Work' },
  { name: 'history_edu', label: 'Tuition & Coaching', group: 'Finance & Work' },
  { name: 'badge', label: 'Badges & Certificates', group: 'Finance & Work' },
  { name: 'desk', label: 'Workstation / Desk', group: 'Finance & Work' },

  // Finance & Banking
  { name: 'credit_card', label: 'Credit Card (CCE)', group: 'Bills & Utilities' },
  { name: 'account_balance', label: 'Banking & Netbanking', group: 'Finance & Work' },
  { name: 'trending_up', label: 'Investments / SIP', group: 'Finance & Work' },
  { name: 'savings', label: 'Savings & Deposits', group: 'Finance & Work' },
  { name: 'wallet', label: 'Wallet & Cash', group: 'Finance & Work' },
  { name: 'monetization_on', label: 'Gold & Assets', group: 'Finance & Work' },
  { name: 'shield', label: 'Insurance (Life/Health)', group: 'Bills & Utilities' },
  { name: 'currency_rupee', label: 'Rupee & Taxes', group: 'Finance & Work' },
  { name: 'payments', label: 'UPI & Instant Pay', group: 'Finance & Work' },
  { name: 'price_check', label: 'Tax & Compliance', group: 'Finance & Work' },

  // General & Misc
  { name: 'event_upcoming', label: 'Our Plans / Goals', group: 'General' },
  { name: 'history', label: 'Previous Month Exp (PME)', group: 'General' },
  { name: 'emergency', label: 'Exceptional & Urgent', group: 'General' },
  { name: 'widgets', label: 'Miscellaneous Expenses', group: 'General' },
  { name: 'category', label: 'Other / General', group: 'General' },
  { name: 'star', label: 'Important & Starred', group: 'General' },
  { name: 'autorenew', label: 'Subscriptions (OTT)', group: 'General' },
  { name: 'luggage', label: 'Vacation Luggage', group: 'General' },
  { name: 'explore', label: 'Trips & Travel', group: 'General' },
  { name: 'hotel', label: 'Hotels & Stay', group: 'General' },
  { name: 'beach_access', label: 'Holidays & Beach', group: 'General' },
];

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
  protected readonly newCategoryIconControl = new FormControl('category');
  private isNewCategoryIconUserPicked = false;

  // Inline edit state
  protected readonly editingCategoryName = signal<string | null>(null);
  protected readonly editCategoryControl = new FormControl('', Validators.required);
  protected readonly editCategoryShortControl = new FormControl('');
  protected readonly editCategoryIconControl = new FormControl('category');

  // Icon Picker Modal State
  protected readonly isIconPickerOpen = signal<boolean>(false);
  protected readonly iconPickerTarget = signal<'new' | 'edit' | null>(null);
  protected readonly iconSearchQuery = signal<string>('');
  protected readonly selectedIconGroup = signal<string>('All');
  protected readonly iconGroups = CATEGORY_ICON_GROUPS;

  // Filtered Icons Computed
  protected readonly filteredIcons = computed(() => {
    const query = this.iconSearchQuery().trim().toLowerCase();
    const group = this.selectedIconGroup();

    return CATEGORY_ICONS.filter((icon) => {
      const matchesGroup = group === 'All' || icon.group === group;
      if (!matchesGroup) return false;

      if (!query) return true;
      return (
        icon.name.toLowerCase().includes(query) ||
        icon.label.toLowerCase().includes(query) ||
        icon.group.toLowerCase().includes(query)
      );
    });
  });

  // Delete state
  protected readonly categoryPendingDelete = signal<string | null>(null);
  protected readonly isReassigning = signal<boolean>(false);

  protected readonly fallbackCategory = FALLBACK_CATEGORY;

  ngOnInit() {
    this.fetchData();

    // Auto-suggest icon when typing category name if user hasn't explicitly chosen one
    this.newCategoryControl.valueChanges.subscribe((val) => {
      if (!this.isNewCategoryIconUserPicked && val && val.trim().length > 1) {
        const suggested = this.getCategoryIcon(val.trim());
        this.newCategoryIconControl.setValue(suggested, { emitEvent: false });
      }
    });
  }

  private sortCategories(cats: CustomCategory[]): CustomCategory[] {
    const regular: CustomCategory[] = [];
    let otherCat: CustomCategory | null = null;

    for (const c of cats) {
      if (c.name.trim().toLowerCase() === FALLBACK_CATEGORY.toLowerCase()) {
        otherCat = c;
      } else {
        regular.push(c);
      }
    }

    if (otherCat) {
      regular.push(otherCat);
    } else {
      regular.push({ name: FALLBACK_CATEGORY, shortName: 'OTHR', icon: 'category' });
    }

    return regular;
  }

  protected fetchData() {
    this.isLoading.set(true);
    this.expenseService.fetchCategories().subscribe({
      next: (res) => {
        if (res.data && Array.isArray(res.data)) {
          this.categories.set(this.sortCategories(res.data));
        }
        this.isLoading.set(false);
      },
      error: () => {
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
    return this.expenses().filter((e) => (e.category || 'other').trim().toLowerCase() === key)
      .length;
  }

  // ── Icon Picker Handlers ──
  protected openIconPicker(target: 'new' | 'edit') {
    this.iconPickerTarget.set(target);
    this.iconSearchQuery.set('');
    this.selectedIconGroup.set('All');
    this.isIconPickerOpen.set(true);
  }

  protected closeIconPicker() {
    this.isIconPickerOpen.set(false);
    this.iconPickerTarget.set(null);
  }

  protected selectPickerIcon(iconName: string) {
    const target = this.iconPickerTarget();
    if (target === 'new') {
      this.newCategoryIconControl.setValue(iconName);
      this.isNewCategoryIconUserPicked = true;
    } else if (target === 'edit') {
      this.editCategoryIconControl.setValue(iconName);
    }
    this.closeIconPicker();
  }

  protected onIconSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.iconSearchQuery.set(input?.value || '');
  }

  protected setIconGroup(group: string) {
    this.selectedIconGroup.set(group);
  }

  // ── Category Icon Resolution ──
  public getCategoryIcon(category: string | CustomCategory): string {
    if (category && typeof category === 'object') {
      if (category.icon) return category.icon;
      return this.resolveCategoryIconByName(category.name);
    }

    const catName = (category || '').trim();
    const found = this.categories().find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (found?.icon) return found.icon;

    return this.resolveCategoryIconByName(catName);
  }

  private resolveCategoryIconByName(name: string): string {
    const key = (name || '').toLowerCase().trim();
    if (CATEGORY_ICON_MAP[key]) return CATEGORY_ICON_MAP[key];

    if (
      key.includes('food') ||
      key.includes('dining') ||
      key.includes('cafe') ||
      key.includes('restaurant')
    )
      return 'restaurant';
    if (key.includes('kitchen') || key.includes('grocer') || key.includes('supermarket'))
      return 'kitchen';
    if (
      key.includes('transport') ||
      key.includes('travel') ||
      key.includes('cab') ||
      key.includes('car') ||
      key.includes('fuel')
    )
      return 'directions_car';
    if (key.includes('bike') || key.includes('scooter') || key.includes('two wheeler'))
      return 'two_wheeler';
    if (
      key.includes('shop') ||
      key.includes('mall') ||
      key.includes('amazon') ||
      key.includes('clothes')
    )
      return 'local_mall';
    if (
      key.includes('bill') ||
      key.includes('rent') ||
      key.includes('recharge') ||
      key.includes('electric') ||
      key.includes('wifi')
    )
      return 'receipt_long';
    if (key.includes('card') || key.includes('credit')) return 'credit_card';
    if (key.includes('friend') || key.includes('meet')) return 'groups';
    if (key.includes('relative') || key.includes('gift')) return 'redeem';
    if (key.includes('party') || key.includes('club') || key.includes('celebrat'))
      return 'celebration';
    if (key.includes('entertain') || key.includes('movie') || key.includes('gaming'))
      return 'movie';
    if (key.includes('health') || key.includes('med') || key.includes('doc') || key.includes('gym'))
      return 'medical_services';
    if (key.includes('home') || key.includes('house')) return 'cottage';
    if (key.includes('work') || key.includes('office') || key.includes('desk'))
      return 'business_center';
    if (key.includes('invest') || key.includes('stock') || key.includes('gold'))
      return 'trending_up';
    if (key.includes('plan')) return 'event_upcoming';
    if (key.includes('help') || key.includes('charity')) return 'volunteer_activism';
    if (key.includes('except') || key.includes('urg') || key.includes('emerg')) return 'emergency';
    if (key.includes('prev') || key.includes('history')) return 'history';
    if (key.includes('misc')) return 'widgets';
    if (key.includes('edu') || key.includes('course') || key.includes('book')) return 'school';
    return 'category';
  }

  protected getCategoryToneClass(category: string): string {
    const key = (category || '').toLowerCase().trim();
    if (CATEGORY_TONE_MAP[key]) return CATEGORY_TONE_MAP[key];

    if (
      key.includes('food') ||
      key.includes('dining') ||
      key.includes('cafe') ||
      key.includes('restaurant') ||
      key.includes('kitchen')
    )
      return 'tone-orange';
    if (
      key.includes('transport') ||
      key.includes('travel') ||
      key.includes('cab') ||
      key.includes('car') ||
      key.includes('bike') ||
      key.includes('fuel')
    )
      return 'tone-cyan';
    if (
      key.includes('shop') ||
      key.includes('mall') ||
      key.includes('amazon') ||
      key.includes('clothes')
    )
      return 'tone-pink';
    if (
      key.includes('bill') ||
      key.includes('rent') ||
      key.includes('recharge') ||
      key.includes('electric') ||
      key.includes('wifi') ||
      key.includes('except')
    )
      return 'tone-amber';
    if (key.includes('card') || key.includes('credit')) return 'tone-purple';
    if (
      key.includes('party') ||
      key.includes('entertain') ||
      key.includes('movie') ||
      key.includes('cinema')
    )
      return 'tone-fuchsia';
    if (key.includes('health') || key.includes('med') || key.includes('doc') || key.includes('gym'))
      return 'tone-green';
    if (key.includes('home') || key.includes('house')) return 'tone-indigo';
    if (key.includes('relative') || key.includes('gift')) return 'tone-pink';
    if (key.includes('our exp') || key.includes('love') || key.includes('couple'))
      return 'tone-rose';
    if (key.includes('friend') || key.includes('meet') || key.includes('help')) return 'tone-teal';
    if (
      key.includes('plan') ||
      key.includes('invest') ||
      key.includes('stock') ||
      key.includes('gold')
    )
      return 'tone-emerald';
    return 'tone-slate';
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
    const icon = this.newCategoryIconControl.value?.trim() || this.getCategoryIcon(rawName);

    const nextList: CustomCategory[] = this.sortCategories([
      ...this.categories(),
      { name: rawName, shortName: short || undefined, icon },
    ]);

    this.isSaving.set(true);
    this.expenseService.updateCategories(nextList).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.categories.set(this.sortCategories(res.data || nextList));
        this.newCategoryControl.reset();
        this.newCategoryShortControl.reset();
        this.newCategoryIconControl.setValue('category');
        this.isNewCategoryIconUserPicked = false;
        this.notificationService.success(`Category "${rawName}" added.`, 'Added');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.notificationService.error(err?.error?.message || 'Failed to add category', 'Error');
      },
    });
  }

  protected startEditCategory(cat: CustomCategory) {
    this.editingCategoryName.set(cat.name);
    this.editCategoryControl.setValue(cat.name);
    this.editCategoryShortControl.setValue(cat.shortName || '');
    this.editCategoryIconControl.setValue(cat.icon || this.getCategoryIcon(cat.name));
  }

  protected cancelEditCategory() {
    this.editingCategoryName.set(null);
    this.editCategoryControl.reset();
    this.editCategoryShortControl.reset();
    this.editCategoryIconControl.setValue('category');
  }

  protected applyEditCategory() {
    const originalName = this.editingCategoryName();
    if (!originalName) return;

    const newName = this.editCategoryControl.value?.trim() || '';
    if (!newName) return;

    const newShort = this.editCategoryShortControl.value?.trim();
    const newIcon = this.editCategoryIconControl.value?.trim() || this.getCategoryIcon(newName);
    const nameChanged = originalName.toLowerCase() !== newName.toLowerCase();

    // Check for duplicate category name
    if (nameChanged) {
      const isDuplicate = this.categories().some(
        (c) => c.name.toLowerCase() === newName.toLowerCase(),
      );
      if (isDuplicate) {
        this.notificationService.warning('A category with this name already exists.', 'Duplicate');
        return;
      }
    }

    const updatedList = this.categories().map((c) => {
      if (c.name.toLowerCase() === originalName.toLowerCase()) {
        return { name: newName, shortName: newShort || undefined, icon: newIcon };
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
              this.categories.set(this.sortCategories(res.data || updatedList));
              this.editingCategoryName.set(null);
              // Update local expenses signal
              this.expenses.update((list) =>
                list.map((e) =>
                  (e.category || '').toLowerCase() === originalName.toLowerCase()
                    ? { ...e, category: newName }
                    : e,
                ),
              );
              this.notificationService.success(
                movedCount > 0
                  ? `Category renamed to "${newName}". ${movedCount} transaction(s) updated.`
                  : `Category renamed to "${newName}".`,
                'Category Updated',
              );
            },
            error: (err) => {
              this.isSaving.set(false);
              this.notificationService.error(
                err?.error?.message || 'Failed to update category list',
                'Error',
              );
            },
          });
        },
        error: (err) => {
          this.isSaving.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to rename category transactions',
            'Error',
          );
        },
      });
    } else {
      // Short name or icon changed
      this.expenseService.updateCategories(updatedList).subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.categories.set(this.sortCategories(res.data || updatedList));
          this.editingCategoryName.set(null);
          this.notificationService.success('Category details updated.', 'Saved');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.notificationService.error(
            err?.error?.message || 'Failed to update category',
            'Error',
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
      (c) => c.name.toLowerCase() !== name.toLowerCase(),
    );

    // Reassign any existing transactions from deleted category to "Other"
    this.expenseService.reassignCategory(name, FALLBACK_CATEGORY).subscribe({
      next: (res) => {
        const movedCount = res.data?.expensesUpdated || 0;
        this.expenseService.updateCategories(updatedList).subscribe({
          next: (catRes) => {
            this.isReassigning.set(false);
            this.categories.set(this.sortCategories(catRes?.data || updatedList));
            this.categoryPendingDelete.set(null);
            // Update local expenses signal
            this.expenses.update((list) =>
              list.map((e) =>
                (e.category || '').toLowerCase() === name.toLowerCase()
                  ? { ...e, category: FALLBACK_CATEGORY }
                  : e,
              ),
            );
            this.notificationService.success(
              movedCount > 0
                ? `"${name}" removed. ${movedCount} transaction(s) moved to "${FALLBACK_CATEGORY}".`
                : `"${name}" removed.`,
              'Category Deleted',
            );
          },
          error: () => {
            this.isReassigning.set(false);
            this.notificationService.error('Failed to update category list', 'Error');
          },
        });
      },
      error: (err) => {
        this.isReassigning.set(false);
        this.notificationService.error(
          err?.error?.message || 'Could not move transactions. Category preserved.',
          'Error',
        );
      },
    });
  }
}
