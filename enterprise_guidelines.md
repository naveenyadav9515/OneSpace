# Enterprise Frontend (Angular) — Architectural & Development Guidelines

This document defines the strict engineering standards, architectural patterns, and development practices governing all frontend changes in the **OneSpace Personal Hub** Angular 20 application. Every feature, component, and service must comply with these guidelines to ensure production-grade quality, maintainability, accessibility, performance, and operational excellence.

---

# Section 1: Project Structure & Organization

## 1.1. Directory Structure (Domain-Driven / Core-Shared Layout)

The Angular application under `src/app/` must follow a strict three-layer architecture:

```
src/app/
├── core/                    # Singleton services, guards, interceptors (provided in root)
│   ├── interceptors/        # Global HTTP interceptors (auth, error, loading)
│   ├── guards/              # Route guards (auth, role, feature-flag)
│   ├── services/            # App-wide singleton services (AuthService, ThemeService)
│   ├── models/              # Global interfaces/types/enums representing domain models
│   └── constants/           # Application-wide constants, route tokens, config keys
├── shared/                  # Reusable UI components, pipes, directives (no business logic)
│   ├── components/          # Generic UI elements (buttons, inputs, modals, loaders, cards)
│   ├── pipes/               # Format pipes (date, currency, truncate, highlight)
│   ├── directives/          # Reusable structural/attribute directives
│   └── validators/          # Custom form validators (reactive forms)
├── features/                # Feature modules (Domain-driven views)
│   ├── dashboard/           # Dashboard bento grid container
│   ├── admin/               # Admin panel (user CRUD, global config)
│   ├── settings/            # User settings (display toggles, theme, imports)
│   ├── notes/               # Feature: Notes
│   ├── kitchen/             # Feature: Kitchen & Kirana
│   ├── finance/             # Feature: Expense & Purchases
│   ├── travel/              # Feature: Travel Logger
│   ├── reminders/           # Feature: Reminders & Plans
│   ├── rules/               # Feature: Ultimate Rules
│   └── movies/              # Feature: Movie Suggestions
├── layouts/                 # Shell layouts (sidebar + header + content area)
│   ├── main-layout/         # Authenticated layout shell
│   └── auth-layout/         # Unauthenticated layout shell
└── environments/            # Environment-specific config files
```

## 1.2. Feature Module Internal Structure

Each feature folder must follow this internal layout:

```
features/[feature-name]/
├── components/              # Smart (container) and dumb (presentation) components
│   ├── [name]-page/         # Smart page-level container component
│   └── [name]-card/         # Dumb presentational child components
├── services/                # Feature-scoped services
│   ├── [name]-api.service.ts    # Stateless HTTP client service
│   ├── [name].store.ts          # State management (Signals / BehaviorSubject)
│   └── [name].service.ts        # Orchestrator/facade coordinating API + Store
├── models/                  # Feature-specific interfaces and types
├── utils/                   # Feature-specific pure utility/helper functions
├── guards/                  # Feature-specific route guards (if needed)
└── [name].routes.ts         # Lazy-loaded route definitions
```

## 1.3. Feature-Scoped vs. Global Services

* **Feature-Scoped**: Services used only within a single feature must reside in `features/[feature-name]/services/`. Use `providedIn: 'root'` only if truly needed app-wide.
* **Global/Core**: App-wide singleton services (Auth, Theme, Notifications, Logger) must be placed in `core/services/`.
* **Rule**: Never import a feature-scoped service into another feature. If two features share logic, extract the common service into `core/services/` or create a shared utility.

## 1.4. Path Aliases

Define TypeScript path aliases in `tsconfig.json` for clean imports:

```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["src/app/core/*"],
      "@shared/*": ["src/app/shared/*"],
      "@features/*": ["src/app/features/*"],
      "@env/*": ["src/environments/*"],
      "@lib/admin/*": ["src/app/features/admin/*"],
      "@lib/notes/*": ["src/app/features/notes/*"]
    }
  }
}
```

* **Rule**: Never use relative paths that traverse more than two levels (`../../`). Use path aliases instead.

---

# Section 2: TypeScript & Type Safety

## 2.1. Strict Type Enforcement

* **No `any`**: Every variable, parameter, return type, API payload, and component property must have explicit TypeScript types or interfaces. The `any` type is strictly forbidden.
* **No Type Assertions Without Justification**: Avoid `as` type assertions. If unavoidable, add a `// SAFETY:` comment explaining why.
* **Strict Mode**: `tsconfig.json` must have `"strict": true` enabled at all times.
* **No Implicit Returns**: All functions must have explicit return types declared.

## 2.2. Interface & Type Conventions

* **Naming**: Interfaces must NOT use the `I` prefix. Use descriptive domain names (e.g., `User`, `NoteItem`, `DashboardWidget`).
* **Location**: Global models in `core/models/`. Feature-specific models in `features/[feature]/models/`.
* **API Response Types**: Define dedicated request/response DTOs separate from domain models (e.g., `CreateNoteRequest`, `NoteResponse`).
* **Enum Usage**: Use `const enum` for compile-time constants. Use regular `enum` only when runtime iteration is required.
* **Union Types**: Prefer union types over enums for simple string literal sets (e.g., `type Role = 'admin' | 'user'`).

## 2.3. Null Safety

* **Enable `strictNullChecks`**: Already covered by `strict: true`.
* **Avoid Non-Null Assertions (`!`)**: Use proper null guards or optional chaining (`?.`) instead.
* **Default Values**: Always provide sensible defaults for optional properties in interfaces and function parameters.

---

# Section 3: Component Architecture

## 3.1. Smart vs. Dumb Components

* **Smart Components (Containers)**: Handle data-fetching, state management, and communicate directly with Services. Placed in `features/[feature]/components/[name]-page/`.
* **Dumb Components (Presentation)**: Rely strictly on `@Input()` / `input()` to receive data and `@Output()` / `output()` to emit events. They perform no direct data fetching. Placed in `shared/components/` or feature-specific child folders.
* **Rule**: A dumb component must never inject a service that performs HTTP calls.

## 3.2. Component Best Practices

* **One Component Per File**: Each component must have its own `.ts`, `.html`, `.scss`, and `.spec.ts` files.
* **Standalone Components**: All new components must be standalone (`standalone: true`). Do not create `NgModule`-based components.
* **ChangeDetection**: Use `ChangeDetectionStrategy.OnPush` on every component without exception.
* **Signal Inputs/Outputs**: Prefer Angular's new `input()`, `output()`, and `model()` signal-based APIs over legacy `@Input()` / `@Output()` decorators for new components.
* **Component Selectors**: Use the `app-` prefix for all component selectors (e.g., `app-note-card`, `app-dashboard-widget`).
* **Template Complexity**: Templates exceeding 50 lines of HTML must be refactored into child components.

## 3.3. Class Member Ordering

All TypeScript classes must organize members in this strict order:

1. **Public Properties & Signals** (at the top)
2. **Protected Properties**
3. **Private Properties**
4. **Constructor / `inject()` calls**
5. **Lifecycle Hooks** (`ngOnInit`, `ngAfterViewInit`, `ngOnDestroy`)
6. **Public Methods**
7. **Protected Methods**
8. **Private Methods** (at the bottom)

## 3.4. Lifecycle Hook Rules

* **`ngOnInit`**: Use for initialization logic, API subscriptions, and signal effects.
* **`ngOnDestroy`**: Clean up all subscriptions, observers, and event listeners.
* **`DestroyRef`**: Prefer Angular's `DestroyRef` with `takeUntilDestroyed()` over manual `ngOnDestroy` subscription cleanup.
* **`afterNextRender` / `afterRender`**: Use for DOM-dependent logic instead of `ngAfterViewInit` where possible.

---

# Section 4: State Management

## 4.1. Signal-First Strategy

* **Preferred**: Use Angular Signals (`signal()`, `computed()`, `effect()`) as the primary state management mechanism.
* **Component State**: Use `signal()` for local component state.
* **Derived State**: Use `computed()` for any state derived from other signals.
* **Side Effects**: Use `effect()` sparingly and only for synchronizing external systems (localStorage, analytics, logging).

## 4.2. RxJS Usage

* **When to Use RxJS**: HTTP calls (`HttpClient` returns Observables), complex async workflows (debounce, retry, race conditions), WebSocket streams.
* **When NOT to Use RxJS**: Simple component state, UI toggles, form state — use Signals instead.
* **Operators**: Use declarative operators (`map`, `switchMap`, `catchError`, `tap`, `distinctUntilChanged`). Avoid nested subscribes.
* **Unsubscription**: Always use `takeUntilDestroyed()`, `DestroyRef`, or the `async` pipe. Never leave dangling subscriptions.

## 4.3. Service Segregation Pattern

* **Client Services (`*-api.service.ts`)**: Stateless. Dedicated to HTTP calls using `HttpClient`. Zero business logic or state.
* **Store Services (`*.store.ts`)**: Hold and mutate application state using Signals or `BehaviorSubject`. No HTTP calls.
* **Orchestrator Services (`*.service.ts`)**: Coordinate API clients and stores. Call the API → map results → update store.

---

# Section 5: HTTP Client & API Integration

## 5.1. Service Encapsulation

* **Components must NEVER call `HttpClient` directly.** All network requests must be encapsulated within dedicated Angular Services.
* **Base URL Configuration**: API base URLs must come from environment files (`environment.ts`), never hardcoded in services.

## 5.2. Global HTTP Interceptors

Implement the following interceptors in `core/interceptors/`:

* **Auth Interceptor**: Attach authorization headers (JWT tokens) to all outgoing API requests.
* **Error Interceptor**: Catch HTTP errors globally, parse the standardized error envelope, and trigger notification/toast messages.
* **Loading Interceptor**: Manage global loading spinner state based on pending HTTP requests.
* **Retry Interceptor** (optional): Auto-retry failed requests (configurable max retries for 5xx errors).

## 5.3. SSR Platform Safety

* **Forbidden**: Direct references to `localStorage`, `sessionStorage`, `window`, `document` in services, interceptors, or component constructors.
* **Required**: Inject `PLATFORM_ID` and gate browser-specific execution with `isPlatformBrowser(platformId)` from `@angular/common`.
* **Alternative**: Use Angular's `afterNextRender()` for DOM-dependent code.

## 5.4. Error Handling in Services

* **HTTP Errors**: Use `catchError` in API service methods. Map backend error envelopes to typed error objects.
* **Retry Logic**: Use `retry(n)` or `retryWhen` for transient failures on safe (GET) endpoints.
* **Timeout**: Apply `timeout()` operator to prevent indefinitely hanging requests.

---

# Section 6: Routing & Navigation

## 6.1. Lazy Loading

* **All feature routes must be lazy-loaded** using `loadChildren` or `loadComponent` in the route configuration.
* **Preloading Strategy**: Use `PreloadAllModules` or a custom strategy for frequently accessed routes.

## 6.2. Route Guards

* **Auth Guard**: Protect all authenticated routes. Redirect unauthenticated users to login.
* **Role Guard**: Restrict admin-only routes (e.g., `/admin`) based on user role.
* **Feature Guard**: Check feature-flag status before activating feature routes. Redirect to dashboard if feature is disabled.
* **Functional Guards**: Use functional route guards (Angular 15+) over class-based guards.

## 6.3. Route Configuration Standards

* **Route Constants**: Define route paths as constants in `core/constants/routes.ts`. Never use string literals in templates or navigation calls.
* **Title Strategy**: Every route must have a `title` property for SEO and browser tab naming.
* **Resolver Pattern**: Use route resolvers for critical data that must load before component rendering.

---

# Section 7: Forms & Validation

## 7.1. Reactive Forms Only

* **Forbidden**: Template-driven forms (`ngModel` for form handling) are not permitted in feature components.
* **Required**: Use Reactive Forms (`FormGroup`, `FormControl`, `FormArray`) with `ReactiveFormsModule`.
* **Typed Forms**: Use Angular's strongly-typed forms API (`FormGroup<T>`) introduced in Angular 14+.

## 7.2. Validation Standards

* **Built-in Validators**: Use Angular's built-in validators (`Validators.required`, `Validators.email`, `Validators.minLength`, etc.).
* **Custom Validators**: Place reusable custom validators in `shared/validators/`.
* **Error Messages**: Centralize form error message mappings. Never hardcode error strings in templates.
* **Cross-Field Validation**: Use group-level validators for cross-field rules.

## 7.3. Form UX Requirements

* **Real-Time Feedback**: Show validation errors on blur or on dirty state, not on pristine fields.
* **Submit Guard**: Disable submit buttons when form is invalid or pristine.
* **Unsaved Changes Guard**: Implement `CanDeactivate` guards on forms with unsaved data.

---

# Section 8: UI Design System & Component Styling

## 8.1. Styling Rules

* **Zero Inline Styling**: Never use `style="..."` attributes in templates.
* **Component Encapsulation**: Each component must have its own `.scss` file. Keep styles scoped.
* **Global Design System**: Define core HSL color palettes, typography scales, spacing tokens, and utility classes in `src/styles.scss` or dedicated SCSS partials.
* **CSS Custom Properties**: Use `--lm-*` prefixed CSS custom properties for all design tokens.

## 8.2. OneSpace Adaptive Design System Compliance

All UI work must conform to the OneSpace Adaptive specifications:

* **Glassmorphism**: Use refractive layers (`.glass-mantle`, `.glass-card`, `.glass-float`) with `backdrop-filter: blur()`.
* **Etched Borders**: Every glass element must have a 0.5px or 1px border using `.border-etched`.
* **Typography**: Use `Geist` font family exclusively. Follow the defined type scale (`display-lg` through `mono-sm`).
* **Color Tokens**: Use only `--lm-*` CSS custom properties. Never hardcode hex/rgb values.
* **Spacing**: All spacing must be multiples of 4px base unit. Use spacing tokens (`--space-stack-sm/md/lg`).
* **Icons**: Material Symbols Outlined via Google Fonts CDN.

## 8.3. Responsive Design

* **Mobile-First**: Write base styles for mobile, then use `min-width` media queries for larger screens.
* **Breakpoints**: Define breakpoints as SCSS variables/mixins (e.g., `$bp-tablet: 768px`, `$bp-desktop: 1024px`, `$bp-wide: 1440px`).
* **App Shell Container ("Mobile-Perfect, Desktop-Contained")**: Since this is a mobile-targeted PWA, use a max-width container strategy on larger screens:
  - Mobile: Full viewport width, zero design compromise.
  - Tablet (768px+): `max-width: 520px`, centered with `margin-inline: auto`.
  - Desktop (1024px+): `max-width: 560px`, centered. Background effects fill the remaining viewport.
  - This ensures the mobile UI is always the primary experience and desktop users see a clean, centered app panel.
* **Touch Targets**: Minimum 44×44px touch targets on all interactive elements.
* **No Horizontal Scroll**: Content must never cause horizontal scroll on any viewport.

## 8.4. Theming

* **Dual Theme Support**: Light Mode ("Snow Glass") as default. Dark Mode ("Deep Space") with neon glows.
* **CSS Custom Properties**: All theme-dependent values must be CSS custom properties toggled via a `data-theme` attribute on `<html>`.
* **SSR Safe Theme**: Theme detection and application must be SSR-safe using `PLATFORM_ID` checks.
* **System Preference Detection**: Respect `prefers-color-scheme` media query as initial default.

---

# Section 9: Accessibility (a11y)

## 9.1. WCAG 2.1 AA Compliance

* **Semantic HTML**: Use proper HTML5 semantic elements (`<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<header>`, `<footer>`).
* **ARIA Attributes**: Add `aria-label`, `aria-describedby`, `aria-expanded`, `aria-hidden`, and `role` attributes where semantic HTML is insufficient.
* **Focus Management**: All interactive elements must be keyboard-focusable with visible focus indicators.
* **Tab Order**: Logical tab order must follow visual layout. Use `tabindex` only when necessary.

## 9.2. Color & Contrast

* **Contrast Ratios**: All text must meet WCAG AA contrast requirements (4.5:1 for normal text, 3:1 for large text).
* **Color Independence**: Never convey information through color alone. Always pair color with text, icons, or patterns.

## 9.3. Screen Reader Support

* **Image Alt Text**: All meaningful images must have descriptive `alt` attributes. Decorative images use `alt=""`.
* **Live Regions**: Use `aria-live` for dynamic content updates (notifications, loading states, errors).
* **Heading Hierarchy**: Maintain proper heading hierarchy (`h1` → `h2` → `h3`). One `<h1>` per page.

---

# Section 10: Performance Optimization

## 10.1. Bundle Size

* **Lazy Loading**: All feature modules must be lazy-loaded (reiterated for emphasis).
* **Tree Shaking**: Import only specific functions/operators from libraries (e.g., `import { map } from 'rxjs/operators'`).
* **Bundle Analysis**: Regularly analyze bundle sizes using `source-map-explorer` or `webpack-bundle-analyzer`.
* **Maximum Budget**: Enforce Angular CLI budget thresholds in `angular.json` (warn at 500KB initial, error at 1MB).

## 10.2. Runtime Performance

* **OnPush Everywhere**: `ChangeDetectionStrategy.OnPush` on all components.
* **TrackBy**: Always provide `trackBy` functions in `@for` / `*ngFor` loops.
* **Virtual Scrolling**: Use `@angular/cdk/scrolling` `VirtualScrollViewport` for lists exceeding 50 items.
* **Debounce User Input**: Debounce search inputs, filter changes, and resize handlers (minimum 300ms).
* **Image Optimization**: Use `NgOptimizedImage` directive for all images. Provide `width` and `height` attributes.

## 10.3. Caching

* **HTTP Caching**: Implement cache headers for static assets. Use service worker caching for PWA offline support.
* **Memoization**: Cache expensive computations using `computed()` signals or RxJS `shareReplay()`.
* **API Response Caching**: Cache GET responses in store services with configurable TTL.

---

# Section 11: Security

## 11.1. XSS Prevention

* **Angular Auto-Escaping**: Rely on Angular's built-in template sanitization. Never bypass with `bypassSecurityTrustHtml()` unless absolutely required with `// SECURITY:` justification comment.
* **No `innerHTML`**: Avoid `innerHTML` binding. Use Angular templates and data binding.
* **CSP Headers**: Configure Content Security Policy headers in the Nginx/deployment layer.

## 11.2. Authentication & Authorization

* **Token Storage**: Store JWT tokens in `httpOnly` cookies (preferred) or `sessionStorage` (never `localStorage` for auth tokens).
* **Token Refresh**: Implement silent token refresh before expiry.
* **Route Protection**: Every authenticated route must have an auth guard.
* **Role-Based UI**: Conditionally render UI elements based on user roles using signals/observables, not by hiding with CSS.

## 11.3. Sensitive Data

* **No Secrets in Frontend**: API keys, secrets, and credentials must NEVER appear in frontend code.
* **Environment Files**: `.env` and environment files with secrets must be in `.gitignore`.

---

# Section 12: Testing

## 12.1. Unit Testing

* **Framework**: Use Jasmine + Karma (Angular default) or Jest (if configured).
* **Coverage Target**: Minimum 80% code coverage for services and utilities. Minimum 60% for components.
* **Test File Location**: Test files must be co-located with their source files (`*.spec.ts`).
* **Naming**: Test descriptions must be behavior-driven: `it('should emit selected note when card is clicked')`.

## 12.2. Component Testing

* **Shallow Testing**: Test components in isolation using `NO_ERRORS_SCHEMA` or mock child components.
* **Interaction Testing**: Test user interactions (clicks, inputs, form submissions) using Angular's `TestBed` and `ComponentFixture`.
* **Signal Testing**: Use `TestBed.flushEffects()` for signal-based component testing.

## 12.3. E2E Testing

* **Framework**: Use Cypress or Playwright for end-to-end tests.
* **Critical Paths**: Cover authentication flow, dashboard loading, feature navigation, and CRUD operations.
* **Test IDs**: Add `data-testid` attributes to interactive elements for stable E2E selectors.

---

# Section 13: Code Quality & Documentation

## 13.1. Self-Documentation

* **JSDoc**: Every service method, component class, utility function, and complex type must have JSDoc comments.
* **Meaningful Names**: Use strict suffix conventions:
  - Components: `*.component.ts`
  - Services: `*.service.ts`, `*-api.service.ts`, `*.store.ts`
  - Models: `*.model.ts`, `*.dto.ts`
  - Utils: `*.util.ts`, `*.helper.ts`
  - Guards: `*.guard.ts`
  - Pipes: `*.pipe.ts`
  - Directives: `*.directive.ts`

## 13.2. DRY & Reuse

* **No Duplication**: Extract repeated logic into shared services, pipes, or utility functions.
* **Utility Extraction**: Move all pure computations, data mapping, and formatting logic into `*.util.ts` files as stateless pure functions.
* **Shared Components**: If a UI pattern appears in more than one feature, extract it to `shared/components/`.

## 13.3. Linting & Formatting

* **ESLint**: Use `@angular-eslint` with strict rules enabled. Zero tolerance for lint errors in CI.
* **Prettier**: Enforce consistent code formatting with Prettier. Configure in `.prettierrc`.
* **Pre-Commit Hooks**: Use Husky + lint-staged to run linting and formatting before every commit.

---

# Section 14: PWA & Offline Support

## 14.1. Service Worker

* **Angular PWA**: Use `@angular/pwa` for service worker configuration.
* **Caching Strategies**: Cache static assets with `installMode: prefetch`. Cache API responses with `installMode: lazy` and TTL.
* **Update Notification**: Implement `SwUpdate` service to notify users of new versions and prompt reload.

## 14.2. Manifest

* **Web App Manifest**: Configure `manifest.webmanifest` with proper app name, icons (multiple sizes), theme colors, and display mode.
* **Installability**: Ensure the app meets PWA installability criteria (HTTPS, manifest, service worker).

---

# Section 15: Internationalization (i18n) — Future Readiness

## 15.1. Preparation Standards

* **No Hardcoded Strings**: All user-facing text must be extracted into constants or translation files, even if i18n is not yet active.
* **Date/Number Formatting**: Use Angular's `DatePipe` and `DecimalPipe` with locale awareness.
* **RTL Support**: Use CSS logical properties (`margin-inline-start` instead of `margin-left`) to support future RTL layouts.

---

# Section 16: Git & Version Control

## 16.1. Commit Standards

* **Conventional Commits**: All commits must follow the format: `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`
  - Example: `feat(notes): add search filtering to notes list`
* **Atomic Commits**: Each commit must represent a single logical change.

## 16.2. Branch Strategy

* **Main Branch**: `main` — production-ready code only.
* **Development Branch**: `develop` — integration branch for features.
* **Feature Branches**: `feature/[ticket-id]-short-description`
* **Hotfix Branches**: `hotfix/[ticket-id]-short-description`

## 16.3. Pull Request Standards

* **PR Template**: Every PR must include: description, screenshots (for UI changes), testing steps, and checklist.
* **Code Review**: Minimum one approval required before merge.
* **CI Passing**: All CI checks (lint, test, build) must pass before merge.

---

# Section 17: Error Handling & User Feedback

## 17.1. Global Error Handler

* **Angular ErrorHandler**: Implement a custom `ErrorHandler` in `core/` that catches unhandled errors, logs them, and shows user-friendly notifications.
* **No Silent Failures**: Every error must either be handled gracefully with user feedback or logged for debugging.

## 17.2. User Notifications

* **Toast/Snackbar System**: Implement a centralized notification service for success, warning, error, and info messages.
* **Error Messages**: Show user-friendly error messages. Never expose technical error details, stack traces, or error codes to end users.
* **Loading States**: Show skeleton loaders or spinners during data fetching. Never show empty screens while loading.
* **Empty States**: Design meaningful empty state views with helpful guidance (not just "No data found").

---

# Section 18: DevOps & Build Configuration

## 18.1. Environment Management

* **Environment Files**: Maintain separate `environment.ts` and `environment.prod.ts` with proper API URLs and feature flags.
* **No Secrets**: Environment files must not contain secrets. Use runtime configuration injection for sensitive values.

## 18.2. Build Optimization

* **Production Build**: Always use `--configuration=production` for deployments (AOT, tree-shaking, minification).
* **Source Maps**: Disable source maps in production builds.
* **Docker Multi-Stage**: Use multi-stage Dockerfile (`build` → `serve` with Nginx) for minimal image size.

## 18.3. CI/CD Integration

* **Build Verification**: Every PR must trigger a CI build to verify compilation and tests pass.
* **Lighthouse Audits**: Run Lighthouse CI checks for performance, accessibility, and SEO scores.
* **Automated Deployment**: Merge to `main` triggers automatic production deployment via GitHub Actions.
