import { Component, inject, signal, AfterViewInit, NgZone, PLATFORM_ID } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ApiService } from '@core/services/api.service';
import { NgIf, isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';

declare var google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, NgIf],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login implements AfterViewInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly isLoading = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // 🚀 Background Warm-Up Ping: 
      this.apiService.fetchHealth().subscribe({
        next: () => undefined,
        error: () => console.warn('Backend server is waking up...')
      });

      if (typeof google !== 'undefined' && environment.googleClientId) {
        google.accounts.id.initialize({
          client_id: environment.googleClientId,
          callback: this.handleGoogleCredentialResponse.bind(this)
        });
        
        google.accounts.id.renderButton(
          document.getElementById('google-btn-wrapper'),
          { theme: 'outline', size: 'large', width: '280' } 
        );
      } else {
        console.warn('Google Identity Services SDK is not configured or not loaded.');
      }
    }
  }

  private handleGoogleCredentialResponse(response: any): void {
    // SDK callbacks happen outside Angular zone, must bring back in to trigger change detection
    this.ngZone.run(() => {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      this.authService.loginWithGoogle(response.credential).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.router.navigateByUrl(this.getSafeReturnUrl());
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.message || 'Google Auth failed.');
        }
      });
    });
  }

  protected onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const credentials = this.loginForm.getRawValue();

    this.authService.login(credentials).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigateByUrl(this.getSafeReturnUrl());
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'An error occurred during login.');
      }
    });
  }

  private getSafeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
  }
}
