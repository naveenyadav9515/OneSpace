import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError, timeout, retry, timer } from 'rxjs';
import { FeaturesResponse, HealthResponse, AuthResponse } from '@core/models/api-response.model';
import { environment } from '@env/environment';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginCredentials {
  firstName: string;
  lastName: string;
}
/**
 * Stateless API client service.
 *
 * Encapsulates all HTTP communication with the backend API.
 * Components must NEVER call HttpClient directly (§5.1).
 *
 * API URL is resolved dynamically:
 * - Development (localhost): `http://localhost:5000/api`
 * - Production (Render): auto-mapped from frontend hostname
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  /** Request timeout in milliseconds (§5.4) */
  private readonly REQUEST_TIMEOUT_MS = 15000;

  /**
   * Resolves the API base URL dynamically based on the current environment.
   * Uses `isPlatformBrowser` for SSR safety (§5.3).
   */

  public get apiUrl(): string {
    if (environment.apiUrl) {
      return environment.apiUrl;
    }

    if (isPlatformBrowser(this.platformId)) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        return `https://${host.replace('-ui', '-services')}/api`;
      }
    }
    return 'http://localhost:5000/api';
  }

  /**
   * Fetches the health-check response from the backend.
   * @returns Observable of the health response envelope
   */
  fetchHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.apiUrl}/health`).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      retry({
        count: 8,
        delay: (error) => {
          if (error.status >= 400 && error.status < 500) return throwError(() => error);
          return timer(5000);
        }
      }),
      catchError((error: unknown) => {
        return throwError(() => error);
      })
    );
  }

  /**
   * Fetches the list of application features from the backend.
   * @returns Observable of the features response envelope
   */
  fetchFeatures(): Observable<FeaturesResponse> {
    return this.http.get<FeaturesResponse>(`${this.apiUrl}/features`).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      retry({
        count: 8,
        delay: (error) => {
          if (error.status >= 400 && error.status < 500) return throwError(() => error);
          return timer(5000);
        }
      }),
      catchError((error: unknown) => throwError(() => error))
    );
  }

  /**
   * Registers a new user.
   */
  register(userData: RegisterPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, userData).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => error))
    );
  }

  /**
   * Logs in an existing user with email and password.
   */
  login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => error))
    );
  }

  /**
   * Authenticates a user using a Google OAuth ID Token.
   */
  loginWithGoogle(token: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/google`, { token }).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => error))
    );
  }
}
