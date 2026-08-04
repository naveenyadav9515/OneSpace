import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** One tab in the app's primary navigation. */
interface NavTab {
  readonly label: string;
  readonly icon: string;
  readonly route: string;
  /**
   * Whether the destination is built yet. Unbuilt tabs still render — the bar is
   * a map of the app, and hiding future destinations makes it read as finished
   * when it is not — but they are marked so the UI can say so on tap rather than
   * appearing broken.
   */
  readonly ready: boolean;
}

/**
 * Fixed primary navigation across the bottom of the app.
 *
 * Replaces the previous brand-and-version footer, which was decoration rather
 * than navigation. Lives in `shared/` because it is app chrome, not a home
 * feature — the other four destinations will mount it too as they land.
 *
 * Active state comes from `routerLinkActive` rather than a tracked signal, so
 * the highlighted tab always matches the URL, including on a deep link, a back
 * gesture or an SSR-rendered first paint.
 */
@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNavComponent {
  protected readonly tabs: readonly NavTab[] = [
    { label: 'Home', icon: 'home', route: '/', ready: true },
    { label: 'Modules', icon: 'grid_view', route: '/modules', ready: false },
    { label: 'Workspaces', icon: 'layers', route: '/workspaces', ready: false },
    { label: 'Insights', icon: 'donut_small', route: '/insights', ready: false },
    { label: 'Profile', icon: 'person', route: '/profile', ready: false },
  ];
}
