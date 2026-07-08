import { Injectable, signal, Inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeType = 'dark' | 'light' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  /** The currently active theme mode */
  private themeSignal = signal<ThemeType>('dark');
  public readonly currentTheme = this.themeSignal.asReadonly();

  private readonly STORAGE_KEY = 'onespace-theme';
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);

    // Initialize theme based on storage or system preference
    this.initializeTheme();

    // Setup an effect to automatically sync DOM attributes and storage whenever the signal changes
    effect(() => {
      const theme = this.themeSignal();
      if (this.isBrowser) {
        // Update DOM
        const effectiveTheme = theme === 'system' ? this.getSystemPreference() : theme;
        document.documentElement.setAttribute('data-theme', effectiveTheme);
        
        // Update Meta Tag for mobile browsers
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
          meta.setAttribute('content', effectiveTheme === 'light' ? '#f4f3f8' : '#13111c');
        }

        // Save to Storage
        localStorage.setItem(this.STORAGE_KEY, theme);
      }
    });
  }

  /**
   * Toggle between Dark and Light explicitly
   */
  public toggleTheme(): void {
    const current = this.themeSignal();
    // If currently system, evaluate what system is and flip it
    if (current === 'system') {
      const systemTheme = this.getSystemPreference();
      this.themeSignal.set(systemTheme === 'dark' ? 'light' : 'dark');
    } else {
      this.themeSignal.set(current === 'dark' ? 'light' : 'dark');
    }
  }

  /**
   * Set a specific theme mode
   */
  public setTheme(theme: ThemeType): void {
    this.themeSignal.set(theme);
  }

  /**
   * Reads initial state safely from localStorage or system preferences
   */
  private initializeTheme(): void {
    if (!this.isBrowser) return;

    const savedTheme = localStorage.getItem(this.STORAGE_KEY) as ThemeType;
    if (savedTheme && ['dark', 'light', 'system'].includes(savedTheme)) {
      this.themeSignal.set(savedTheme);
    } else {
      // Default to system preference if no saved preference
      this.themeSignal.set('system');
    }

    // Listen for OS theme changes if set to system
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (this.themeSignal() === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
      }
    });
  }

  /**
   * Determine the underlying OS preference
   */
  private getSystemPreference(): 'dark' | 'light' {
    if (!this.isBrowser) return 'dark'; // Safe fallback
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches 
      ? 'dark' 
      : 'light';
  }
}
