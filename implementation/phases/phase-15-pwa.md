# Phase 15: PWA & Offline Support (Frontend)

> Service worker and Web App Manifest configuration.

---

## Epic 15.1: Progressive Web App

### Feature 15.1.1: Service Worker
- [ ] Run `ng add @angular/pwa`
- [ ] Configure `ngsw-config.json`
- [ ] Prefetch static assets (fonts, icons, CSS)
- [ ] Lazy cache API responses where appropriate

### Feature 15.1.2: Web App Manifest
- [ ] Configure `manifest.webmanifest`
- [ ] App Name: OneSpace
- [ ] Generate and link icons (72px - 512px)
- [ ] Set display mode: `standalone`
- [ ] Set theme colors to match Deep Space theme

### Feature 15.1.3: Update Notifications
- [ ] Use `SwUpdate` service
- [ ] Listen for new versions
- [ ] Show toast notification: "New version available. Reload?"


---

## Performance & Monitoring (Frontend)

> Optimization audits, lazy loading, and core web vitals.

---

## Epic 15.2: Asset Optimization

### Feature 15.2.1: Audits
- [ ] Run `source-map-explorer` and split heavy chunks
- [ ] Implement virtual scrolling for long lists
- [ ] Add `NgOptimizedImage` directives

### Feature 15.2.2: SEO
- [ ] Add Angular `TitleStrategy`
- [ ] Dynamic meta descriptions per page
