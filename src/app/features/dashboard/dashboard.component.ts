import {
  Component,
  ChangeDetectionStrategy,
  signal,
  afterNextRender,
  inject,
  PLATFORM_ID,
  HostListener,
  ElementRef,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { isPlatformBrowser, SlicePipe, DatePipe, DecimalPipe } from '@angular/common';
import { ApiService } from '@core/services/api.service';
import { Feature } from '@core/models/feature.model';
import { FeatureLog } from '@core/models/feature-log.model';
import { NotificationService } from '@core/services/notification.service';
import { ThemeService } from '@core/services/theme.service';
import { AuthService } from '@core/services/auth.service';
import { ExpenseService } from '@core/services/expense.service';
import {
  DbConnectionStatus,
  APP_STRINGS,
  DB_STATUS_ICONS,
  GREETING_THRESHOLDS,
  GREETINGS,
  STORAGE_KEYS,
} from '@core/constants/app.constants';

import { LoaderComponent } from '../../shared/components';
/**
 * Dashboard Component.
 *
 * Primary user landing page showing the greeting header, database connection status,
 * and a hybrid flow of full-width and grid features.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoaderComponent, RouterLink, DecimalPipe],
})
export class DashboardComponent {
  /* ── Protected Properties & Signals ── */

  protected readonly strings = APP_STRINGS;
  protected readonly dbIcons = DB_STATUS_ICONS;
  protected readonly userName = 'Naani';

  protected readonly greeting = signal<string>(GREETINGS.DEFAULT);
  protected readonly dbStatus = signal<DbConnectionStatus>('connecting');
  protected readonly features = signal<Feature[]>([]);
  protected readonly apiMessage = signal<string>('');
  
  /** Current feature selected for showing detail modal */
  protected readonly selectedFeature = signal<Feature | null>(null);

  /** Settings and Theme options state */
  protected readonly isSettingsOpen = signal<boolean>(false);


  /* ── Private Dependencies ── */
  private readonly apiService = inject(ApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  protected readonly expenseService = inject(ExpenseService);
  
  protected readonly currentTheme = this.themeService.currentTheme;
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.setGreetingByTimeOfDay();
      this.loadApiData();
    });
  }

  /* ── Protected Methods ── */

  /** Gets a loaded feature by name */
  protected getFeature(name: string): Feature | undefined {
    return this.features().find(
      (f) => f.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
  }

  /** Navigates to the Feature Log screen */
  protected openFeatureLog(): void {
    this.router.navigate(['/upcoming-features']);
  }

  /** Handles clicking on feature cards to show details modal */
  protected onFeatureClick(feature: Feature): void {
    this.selectedFeature.set(feature);
  }

  /** Closes the feature details modal */
  protected closeDetails(): void {
    this.selectedFeature.set(null);
  }

  /** Toggles the settings theme dropdown menu */
  protected toggleSettingsMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isSettingsOpen.update((open) => !open);
  }

  /** Sets the active system theme (dark/light) */
  protected setTheme(theme: 'dark' | 'light'): void {
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.classList.add('theme-transitioning');
      
      this.themeService.setTheme(theme);

      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 1500);
    }
    this.isSettingsOpen.set(false);
  }

  /** Logs the user out and clears the session securely */
  protected logout(): void {
    this.isSettingsOpen.set(false);
    this.authService.logout();
  }

  /** Click handler to automatically close the settings dropdown when clicking outside */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const settingsContainer = this.elementRef.nativeElement.querySelector('.settings-container');
    const isClickInside = settingsContainer && settingsContainer.contains(target);
    if (!isClickInside) {
      this.isSettingsOpen.set(false);
    }
  }

  /** Keydown handler to close settings dropdown on Escape key press */
  @HostListener('document:keydown.escape')
  protected onEscapePress(): void {
    this.isSettingsOpen.set(false);
  }



  /* ── Private Methods ── */

  /** Sets greeting message based on current hour */
  private setGreetingByTimeOfDay(): void {
    const hour = new Date().getHours();
    if (hour < GREETING_THRESHOLDS.MORNING_END) {
      this.greeting.set(GREETINGS.MORNING);
    } else if (hour < GREETING_THRESHOLDS.AFTERNOON_END) {
      this.greeting.set(GREETINGS.AFTERNOON);
    } else {
      this.greeting.set(GREETINGS.EVENING);
    }
  }




  /** Fetches features from the API */
  private loadApiData(): void {
    this.apiService.fetchHealth().subscribe({
      next: (res) => {
        this.apiMessage.set(res.message);
        // Note: dbStatus will be set to connected by fetchFeatures
      },
      error: () => {
        this.dbStatus.set('error');
        this.notificationService.error('Failed to establish connection with server', 'System Offline');
      },
    });

    this.apiService.fetchFeatures().subscribe({
      next: (res) => {
        this.features.set(res.data);
        this.dbStatus.set('connected');
      },
      error: () => {
        this.dbStatus.set('error');
      },
    });

    this.expenseService.fetchSummary().subscribe();
  }

  /** Gets fallback icon name based on feature name */
  private getIconForFeature(name: string): string {
    switch (name.toLowerCase()) {
      case 'notes': return 'sticky_note_2';
      case 'kitchen': return 'countertops';
      case 'finance tracker': return 'account_balance';
      case 'travel': return 'flight_takeoff';
      case 'reminders': return 'notifications_active';
      case 'purchases': return 'shopping_bag';
      case 'kirana': return 'shopping_cart';
      case 'plans': return 'event';
      case 'rules': return 'gavel';
      case 'movies': return 'movie';
      case 'streak loggers': return 'grid_on';
      default: return 'widgets';
    }
  }

  /* ── Helper Methods for Rich Expense UI ── */
  
  protected getChartYPercent(val: number, data: number[]): number {
    if (!data || data.length === 0) return 0;
    const max = Math.max(...data, 100);
    return ((max - val) / max) * 100;
  }

  protected generateChartPoints(data: number[]): string {
    if (!data || data.length === 0) return '';
    const max = Math.max(...data, 100);
    const height = 40;
    const step = 100 / (data.length - 1);
    
    return data.map((val, i) => {
      const x = i * step;
      const y = height - ((val / max) * height);
      return `${x},${y}`;
    }).join(' ');
  }

  protected generateChartPolygon(data: number[]): string {
    if (!data || data.length === 0) return '';
    const points = this.generateChartPoints(data);
    return `${points} 100,40 0,40`;
  }

  protected getCategoryColor(index: number, name?: string): string {
    if (name === 'Food & Dining') return '#F97316';
    if (name === 'Shopping') return '#EC4899';
    if (name === 'Transport') return '#3B82F6';
    
    const colors = [
      '#14B8A6', // Teal
      '#A855F7', // Purple
      '#6B7280', // Gray
      '#F59E0B',
      '#22C55E'
    ];
    return colors[index % colors.length];
  }

  protected getDonutSegments(categories: { percentage: number }[] | undefined): any[] {
    if (!categories || categories.length === 0) return [];
    
    // Circle with radius 40 has circumference of 251.327
    const circumference = 251.327;
    let currentOffset = 0; // Starts at 0
    
    return categories.map((cat, i) => {
      const color = this.getCategoryColor(i, (cat as any).name);
      
      // Calculate length of this segment
      // We subtract 4 to create a visual gap between segments
      const rawLength = (cat.percentage / 100) * circumference;
      const length = Math.max(0, rawLength - 4);
      
      const dasharray = `${length} ${circumference}`;
      
      // SVG stroke-dashoffset rotates backwards, and starts from right (3 o'clock)
      // Offset moves the start point backwards.
      const dashoffset = -currentOffset;
      
      currentOffset += rawLength;
      
      return {
        color,
        dasharray,
        dashoffset
      };
    });
  }


}
