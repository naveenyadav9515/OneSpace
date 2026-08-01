import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

/** A single tab in the bar. */
export interface TabDefinition {
  /** Stable identifier, used to build the tab/panel element ids. */
  id: string;
  label: string;
  /** Material Symbols ligature name. */
  icon?: string;
  /** Optional count pill — omitted when undefined or zero. */
  badge?: number;
}

/** Minimum travel before a gesture is judged horizontal or vertical. */
const DIRECTION_LOCK_PX = 8;

/** Fraction of the viewport a swipe must cross to change tabs. */
const COMMIT_RATIO = 0.2;

/** Floor for the commit distance, so short viewports stay usable. */
const COMMIT_MIN_PX = 56;

/** Damping applied when dragging past the first or last tab. */
const EDGE_RESISTANCE = 0.35;

/** Elements whose own pointer behaviour (text selection, option picking) wins over swiping. */
const INTERACTIVE = 'input, textarea, select, [contenteditable="true"]';

/**
 * Tab bar with swipeable panels.
 *
 * Panels are projected as direct children, one per tab, in the same order as
 * `tabs`. The track is a single-row grid with `grid-auto-columns: 100%`, so each
 * child is sized by the container — no child selectors are needed, which keeps
 * this working under Angular's emulated view encapsulation.
 *
 * Consumers own the panel elements and must therefore set `role="tabpanel"`,
 * `id="panel-{tab.id}"` and `aria-labelledby="tab-{tab.id}"` on each, plus
 * `inert` on the inactive ones.
 */
@Component({
  selector: 'app-swipeable-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './swipeable-tabs.component.html',
  styleUrl: './swipeable-tabs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwipeableTabsComponent implements OnDestroy {
  readonly tabs = input.required<TabDefinition[]>();

  /** Index of the visible panel. Two-way bindable. */
  readonly activeIndex = model<number>(0);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  /** Live finger displacement, in px. Zero whenever a gesture is not in flight. */
  protected readonly dragOffset = signal(0);
  protected readonly isDragging = signal(false);

  /**
   * Height of the active panel. Without this the grid would always be as tall as
   * the tallest panel, leaving a long blank gap under the shorter ones.
   */
  protected readonly viewportHeight = signal<number | null>(null);

  protected readonly trackTransform = computed(
    () => `translate3d(calc(${-this.activeIndex() * 100}% + ${this.dragOffset()}px), 0, 0)`,
  );

  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private viewportWidth = 0;
  /** null = direction not yet locked for this gesture. */
  private isHorizontal: boolean | null = null;

  private resizeObserver?: ResizeObserver;

  constructor() {
    // Re-measure whenever the active tab changes or the tab set is replaced.
    effect(() => {
      this.activeIndex();
      this.tabs();
      if (this.isBrowser) {
        queueMicrotask(() => this.observePanels());
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected selectTab(index: number): void {
    const count = this.tabs().length;
    if (count === 0) return;
    this.activeIndex.set(Math.min(Math.max(index, 0), count - 1));
  }

  /** Roving tabindex: only the active tab is reachable with Tab. */
  protected tabIndexFor(index: number): number {
    return index === this.activeIndex() ? 0 : -1;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const last = this.tabs().length - 1;
    const current = this.activeIndex();
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowRight': next = current === last ? 0 : current + 1; break;
      case 'ArrowLeft': next = current === 0 ? last : current - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }

    event.preventDefault();
    this.selectTab(next);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  protected onPointerDown(event: PointerEvent): void {
    // A second finger, or a drag starting on a control that needs its own
    // horizontal pointer handling, must not begin a swipe.
    if (this.pointerId !== null || event.button !== 0) return;
    if ((event.target as HTMLElement)?.closest?.(INTERACTIVE)) return;

    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.isHorizontal = null;
    this.viewportWidth = (event.currentTarget as HTMLElement).clientWidth || 1;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (this.isHorizontal === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      this.isHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!this.isHorizontal) {
        // Vertical intent — hand the gesture back so the page scrolls normally.
        this.endGesture();
        return;
      }
      this.isDragging.set(true);
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        // The pointer can already be gone (fast flick, pointer left the window).
        // Capture is an enhancement — the gesture still resolves without it.
      }
    }

    this.dragOffset.set(this.applyEdgeResistance(dx));
  }

  protected onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;

    if (this.isHorizontal) {
      const threshold = Math.max(COMMIT_MIN_PX, this.viewportWidth * COMMIT_RATIO);
      const dx = event.clientX - this.startX;
      if (Math.abs(dx) > threshold) {
        this.selectTab(this.activeIndex() + (dx < 0 ? 1 : -1));
      }
    }
    this.endGesture();
  }

  /** Drags beyond the first or last tab are damped rather than blocked outright. */
  private applyEdgeResistance(dx: number): number {
    const atStart = this.activeIndex() === 0 && dx > 0;
    const atEnd = this.activeIndex() === this.tabs().length - 1 && dx < 0;
    return atStart || atEnd ? dx * EDGE_RESISTANCE : dx;
  }

  private endGesture(): void {
    this.pointerId = null;
    this.isHorizontal = null;
    this.isDragging.set(false);
    this.dragOffset.set(0);
  }

  /**
   * Keeps `viewportHeight` in step with the active panel, including when its
   * content grows later (a list finishing loading, a validation message opening).
   */
  private observePanels(): void {
    const panels = Array.from(this.track().nativeElement.children) as HTMLElement[];
    const active = panels[this.activeIndex()];
    if (!active) return;

    this.viewportHeight.set(active.offsetHeight);

    this.resizeObserver?.disconnect();
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => {
      const current = panels[this.activeIndex()];
      if (current) this.viewportHeight.set(current.offsetHeight);
    });
    panels.forEach((panel) => this.resizeObserver?.observe(panel));
  }
}
