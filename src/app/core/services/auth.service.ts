import { Injectable, signal, computed, Inject, PLATFORM_ID, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { User } from '../models/user.model';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { LoginCredentials, RegisterPayload } from './api.service';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthPayload, AuthResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  /** Reactive state holding the currently authenticated user session */
  private readonly userSignal = signal<User | null>(null);
  public readonly activeUser = this.userSignal.asReadonly();

  /** Reactive state holding the JWT access token */
  private readonly tokenSignal = signal<string | null>(null);
  public readonly token = this.tokenSignal.asReadonly();

  /** Computed signal that strictly returns true if the user is an admin */
  public readonly isAdmin = computed(() => this.userSignal()?.role === 'admin');

  /** Computed signal indicating if the user is authenticated at all */
  public readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  private readonly STORAGE_KEY_TOKEN = 'onespace-auth-token';
  private readonly STORAGE_KEY_USER = 'onespace-auth-user';
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.initializeStateFromStorage();

    // Setup an effect to sync the session state with localStorage automatically
    effect(() => {
      const currentToken = this.tokenSignal();
      const currentUser = this.userSignal();

      if (this.isBrowser) {
        if (currentToken && currentUser) {
          localStorage.setItem(this.STORAGE_KEY_TOKEN, currentToken);
          localStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(currentUser));
        } else {
          localStorage.removeItem(this.STORAGE_KEY_TOKEN);
          localStorage.removeItem(this.STORAGE_KEY_USER);
        }
      }
    });
  }

  /**
   * Called internally on boot to hydrate the Signals from persistent storage
   */
  private initializeStateFromStorage(): void {
    if (!this.isBrowser) return;

    try {
      const savedToken = localStorage.getItem(this.STORAGE_KEY_TOKEN);
      const savedUserStr = localStorage.getItem(this.STORAGE_KEY_USER);

      if (savedToken && savedUserStr) {
        const savedUser = JSON.parse(savedUserStr) as User;
        this.tokenSignal.set(savedToken);
        this.userSignal.set(savedUser);
      }
    } catch (e) {
      console.error('Failed to parse stored authentication state', e);
      // Failsafe clear if storage is corrupted
      localStorage.removeItem(this.STORAGE_KEY_TOKEN);
      localStorage.removeItem(this.STORAGE_KEY_USER);
    }
  }

  /**
   * Explicitly updates the authentication state.
   * This will trigger the effect to persist the new state to localStorage.
   */
  public setSession(user: User, token: string): void {
    this.tokenSignal.set(token);
    this.userSignal.set(user);
  }

  /**
   * Clears the current session and wipes localStorage.
   */
  public clearSession(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }
  
  // ==========================================
  // API Integrations (Feature 2.1.2 & 2.4.2)
  // ==========================================
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);

  public login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.apiService.login(credentials).pipe(
      tap((res: AuthResponse) => this.setSessionFromPayload(res.data))
    );
  }

  public register(userData: RegisterPayload): Observable<AuthResponse> {
    return this.apiService.register(userData).pipe(
      tap((res: AuthResponse) => this.setSessionFromPayload(res.data))
    );
  }
  
  public loginWithGoogle(token: string): Observable<AuthResponse> {
    return this.apiService.loginWithGoogle(token).pipe(
      tap((res: AuthResponse) => this.setSessionFromPayload(res.data))
    );
  }

  public logout(): void {
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  private setSessionFromPayload(payload: AuthPayload): void {
    const { token, ...user } = payload;
    this.setSession(user, token);
  }
}
