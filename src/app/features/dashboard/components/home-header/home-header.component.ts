import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  inject,
  computed,
  HostListener,
  ElementRef,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '@core/services/auth.service';
import { ThemeService } from '@core/services/theme.service';
import {
  DbConnectionStatus,
  APP_STRINGS,
  GREETING_THRESHOLDS,
  GREETINGS,
} from '@core/constants/app.constants';

/**
 * The home screen's masthead: brand mark, time-aware greeting, connection and
 * notification indicators, and the account menu behind the avatar.
 *
 * Owns its own concerns rather than taking a dozen inputs — the theme toggle and
 * sign-out belong to the account menu, and the greeting is a function of the
 * clock, not of anything the page knows. The one thing it cannot determine for
 * itself is whether the API is reachable, so `dbStatus` comes in as an input.
 *
 * The account menu replaced a separate settings gear. The new layout has room
 * for three controls, and theme and sign-out are both account-level actions, so
 * folding them under the avatar removes a control without removing a capability.
 */
@Component({
  selector: 'app-home-header',
  standalone: true,
  templateUrl: './home-header.component.html',
  styleUrl: './home-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHeaderComponent {
  /** Reachability of the API, surfaced as the cloud indicator. */
  readonly dbStatus = input.required<DbConnectionStatus>();

  /** Unread notification count; drives the bell's badge. */
  readonly notificationCount = input(0);

  protected readonly strings = APP_STRINGS;

  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly currentTheme = this.themeService.currentTheme;
  protected readonly isMenuOpen = signal(false);

  /**
   * Greeting for the current hour.
   *
   * A signal set once on construction rather than a computed: the greeting only
   * changes at two moments in the day, and recomputing it on every change
   * detection pass to catch them is not a trade worth making.
   */
  protected readonly greeting = signal<string>(GREETINGS.DEFAULT);

  /** First name, falling back to the full display name and then a neutral word. */
  protected readonly userName = computed(() => {
    const user = this.authService.activeUser();
    return user?.firstName?.trim() || 'there';
  });

  /** Local asset used when the account has no picture, or its URL fails to load. */
  private readonly fallbackAvatar = '/profile_avatar.png';

  /**
   * Set once a remote avatar has actually failed.
   *
   * A stored `avatarUrl` is not a guarantee the image resolves — a Google
   * profile photo can 403 once the sign-in that issued it ages out, and the
   * result was a broken image showing its alt text inside the ring.
   */
  private readonly avatarFailed = signal(false);

  protected readonly avatarUrl = computed(() => {
    if (this.avatarFailed()) return this.fallbackAvatar;
    return this.authService.activeUser()?.avatarUrl?.trim() || this.fallbackAvatar;
  });

  protected onAvatarError(): void {
    this.avatarFailed.set(true);
  }

  /** Cloud icon reflects reachability rather than showing a generic cloud. */
  protected readonly dbIcon = computed(() => {
    switch (this.dbStatus()) {
      case 'connected': return 'cloud_done';
      case 'error': return 'cloud_off';
      default: return 'cloud_sync';
    }
  });

  constructor() {
    const hour = new Date().getHours();
    if (hour < GREETING_THRESHOLDS.MORNING_END) {
      this.greeting.set(GREETINGS.MORNING);
    } else if (hour < GREETING_THRESHOLDS.AFTERNOON_END) {
      this.greeting.set(GREETINGS.AFTERNOON);
    } else {
      this.greeting.set(GREETINGS.EVENING);
    }
  }

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isMenuOpen.update((open) => !open);
  }

  protected setTheme(theme: 'dark' | 'light'): void {
    if (isPlatformBrowser(this.platformId)) {
      // Suppresses per-property transitions during the swap; without it every
      // tokenised colour animates independently and the change looks like a
      // glitch rather than a theme switch.
      document.documentElement.classList.add('theme-transitioning');
      this.themeService.setTheme(theme);
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 1500);
    }
    this.isMenuOpen.set(false);
  }

  protected logout(): void {
    this.isMenuOpen.set(false);
    this.authService.logout();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.isMenuOpen()) return;
    const menu = this.elementRef.nativeElement.querySelector('.hh-account');
    if (!menu?.contains(event.target as Node)) this.isMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.isMenuOpen.set(false);
  }
}
