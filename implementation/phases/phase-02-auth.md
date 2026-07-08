# Phase 2: Authentication & Authorization (Frontend)

> Auth service, login/register UI, and development user switcher.

---

## Epic 2.1: Authentication Service

### Feature 2.1.1: State Management
- [x] **Completed** - Create `core/services/auth.service.ts` using Angular Signals
- [x] **Completed** - Define `activeUser` signal holding the current user session (or null)
- [x] **Completed** - Define `isAdmin` computed signal derived from `activeUser.role`
- [x] **Completed** - Define `token` signal holding the JWT access token
- [x] **Completed** - Persist token in `localStorage` safely (with SSR checks)

### Feature 2.1.2: API Integration
- [x] **Completed** - Implement `login(credentials)` — calls API, sets signals, saves token
- [x] **Completed** - Implement `register(userData)` — calls API, auto-logins on success
- [x] **Completed** - Implement `logout()` — clears signals and storage, redirects to login
- [x] **Completed** - Implement `switchUser(userId)` — development-only session switcher, calls `/api/auth/switch`

---

## Epic 2.2: Auth Layout & UI Components

### Feature 2.2.1: Auth Layout Shell
- [x] **Completed** - Build `layouts/auth-layout/auth-layout.component.ts`
- [x] **Completed** - Minimal centered card layout with OneSpace branding
- [x] **Completed** - Dark/Light mode toggle in the corner

### Feature 2.2.2: Login Page
- [x] **Completed** - Build `features/auth/login/login.component.ts`
- [ ] Reactive form: email, password
- [ ] Validation: required fields, valid email format
- [ ] Loading state on submit button
- [x] **Completed** - Error message display (invalid credentials)
- [ ] "Don't have an account? Register" link

### Feature 2.2.3: Register Page
- [x] **Completed** - Build `features/auth/register/register.component.ts`
- [ ] Reactive form: firstName, lastName, email, password
- [ ] Validation: password strength, required fields
- [ ] Loading state on submit button

### Feature 2.2.4: Dev-Only User Switcher
- [ ] Build `shared/components/user-switcher/user-switcher.component.ts`
- [ ] Dropdown to select a predefined test user (e.g., User A, User B, Admin)
- [ ] Hidden entirely when `environment.production === true`
- [ ] Placed in the main layout header during development

---

## Epic 2.3: Password Recovery Flow

### Feature 2.3.1: Forgot Password Page
- [ ] Build `features/auth/forgot-password/forgot-password.component.ts`
- [ ] Input field for Email Address
- [ ] API call to trigger reset email
- [ ] Success state: "If an account exists, a recovery email has been sent."

### Feature 2.3.2: Reset Password Page
- [ ] Build `features/auth/reset-password/reset-password.component.ts` (Route: `/reset-password/:token`)
- [ ] Input fields for New Password and Confirm Password
- [ ] Form validation to ensure passwords match
- [ ] API call to submit new password and auto-login user upon success
