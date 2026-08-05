import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  viewChild,
  ElementRef,
  computed,
  effect,
  afterNextRender,
  inject,
  DestroyRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * Where the previous/next chevrons sit.
 *
 * `edge` overlays them on the left and right of the strip, for sections showing
 * more than one item at a time — Priority Reminders, where the controls belong
 * beside the cards they move. `inline` places them either side of the dots,
 * which is what a one-card-per-view strip uses: with a single full-width card
 * there is no margin to overlay a chevron onto without covering content.
 */
export type CarouselControls = 'edge' | 'inline' | 'none' | 'dots-only';

/**
 * Horizontally snapping strip with chevron controls and dot pagination.
 *
 * Shared by AI Insights (one card per view) and Priority Reminders (two, with
 * the next one peeking). The difference between those is entirely the item width
 * the consumer sets in its own stylesheet — this component owns the scrolling,
 * the snap behaviour, the controls and the active-index bookkeeping, none of
 * which either section should be reimplementing.
 *
 * Scrolling is native `scroll-snap`, not a transform-driven track. That keeps
 * touch inertia, trackpad gestures and keyboard scrolling working exactly as the
 * platform provides them, and means the strip degrades to a plain scrollable row
 * if scripting is unavailable.
 */
@Component({
  selector: 'app-carousel',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './carousel.component.html',
  styleUrl: './carousel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarouselComponent {
  /**
   * Number of items projected, which is what the dots represent.
   *
   * Taken as an input rather than measured from the DOM: the consumer already
   * knows its collection length, and reading it from projected content would
   * mean re-querying on every data change and guessing at SSR.
   */
  readonly count = input.required<number>();

  /** Accessible name for the strip, e.g. "Priority reminders". */
  readonly label = input<string>('Carousel');

  /** Chevron placement; `none` for strips short enough to not need them. */
  readonly controls = input<CarouselControls>('edge');

  /**
   * Collapses the strip to the height of the item in view.
   *
   * Off by default, which leaves the flex default of every item stretching to
   * the tallest — right for a row of uniform cards. It is wrong for a
   * one-per-view strip of variable-length prose: the shortest insight would be
   * padded out with the dead space of the longest, which is what makes the
   * section look broken rather than merely tall.
   */
  readonly fitToActive = input(false);

  /** Automatically cycle through the carousel items. */
  readonly autoPlay = input(false);

  /** Number of milliseconds to wait before automatically advancing to the next item. */
  readonly autoPlayInterval = input(3000);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private readonly destroyRef = inject(DestroyRef);

  /** Index of the leftmost fully-visible item; drives the active dot. */
  protected readonly activeIndex = signal(0);

  /** Measured height of the active item; null until measured, and when unused. */
  protected readonly activeHeight = signal<number | null>(null);

  protected readonly dots = computed(() => Array.from({ length: this.count() }, (_, i) => i));

  protected readonly canScrollBack = computed(() => this.activeIndex() > 0);
  protected readonly canScrollForward = computed(() => this.activeIndex() < this.count() - 1);

  private observer?: ResizeObserver;
  private autoPlayTimer?: ReturnType<typeof setInterval>;

  // Drag-to-scroll state
  private isDragging = false;
  private startX = 0;
  private scrollLeftStart = 0;
  private dragDeltaX = 0;

  constructor() {
    // afterNextRender never runs on the server, which is what keeps ResizeObserver
    // — a browser-only API — out of the prerender pass.
    afterNextRender(() => {
      if (this.autoPlay()) {
        this.startAutoPlay();
        this.destroyRef.onDestroy(() => this.stopAutoPlay());
      }

      if (!this.fitToActive()) return;

      this.observer = new ResizeObserver(() => this.measureActive());
      this.destroyRef.onDestroy(() => this.observer?.disconnect());

      this.syncObserved();
    });

    // The projected set changes without this component being recreated, so the
    // observed elements have to be re-established when the count does.
    effect(() => {
      this.count();
      if (this.observer) this.syncObserved();
    });
  }

  /** Starts the autoplay interval timer safely. */
  private startAutoPlay(): void {
    this.stopAutoPlay();
    if (!this.autoPlay()) return;

    this.autoPlayTimer = setInterval(() => {
      const el = this.track()?.nativeElement;
      if (!el || this.isDragging) return;

      // Check if we've reached the maximum physical scroll limit.
      const isAtEnd = Math.abs((el.scrollWidth - el.clientWidth) - el.scrollLeft) <= 2;

      if (isAtEnd) {
        this.scrollTo(0);
      } else {
        this.scrollTo(this.activeIndex() + 1);
      }
    }, this.autoPlayInterval());
  }

  /** Clears the autoplay interval timer. */
  private stopAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = undefined;
    }
  }

  protected onMouseEnter(): void {
    if (this.autoPlay()) {
      this.stopAutoPlay();
    }
  }

  protected onMouseLeave(): void {
    if (this.autoPlay() && !this.isDragging) {
      this.startAutoPlay();
    }
  }

  /**
   * Recomputes the active index from the scroll offset.
   *
   * Derived from the first item's width plus the gap rather than a stored page
   * size, so it stays correct when the viewport resizes or the items reflow —
   * neither of which fires anything else this component listens to.
   */
  protected onScroll(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;

    const step = this.itemStep(el);
    if (step <= 0) return;

    const index = Math.round(el.scrollLeft / step);
    this.activeIndex.set(Math.max(0, Math.min(index, this.count() - 1)));

    this.measureActive();
  }

  // --- Drag & Swipe Implementation ---

  protected onPointerDown(e: PointerEvent): void {
    // Only allow primary button drag or touch interaction
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    const el = this.track()?.nativeElement;
    if (!el) return;

    this.stopAutoPlay();
    this.isDragging = true;
    this.startX = e.clientX;
    this.scrollLeftStart = el.scrollLeft;
    this.dragDeltaX = 0;
    
    // Disable CSS scroll snapping and smooth scrolling while manually dragging
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
    el.style.userSelect = 'none';
    
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }
  }

  protected onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;
    
    const el = this.track()?.nativeElement;
    if (!el) return;

    this.dragDeltaX = this.startX - e.clientX;
    el.scrollLeft = this.scrollLeftStart + this.dragDeltaX;
  }

  protected onPointerUp(e: PointerEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    
    const el = this.track()?.nativeElement;
    if (!el) return;

    // Restore CSS snapping and smooth scrolling
    el.style.scrollSnapType = 'x mandatory';
    el.style.scrollBehavior = 'smooth';
    el.style.userSelect = '';
    
    try {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Fallback
    }

    // Determine target index: if dragged > 30px, snap to next/previous item
    const step = this.itemStep(el);
    if (step > 0 && Math.abs(this.dragDeltaX) > 30) {
      const targetIndex = this.dragDeltaX > 0 ? this.activeIndex() + 1 : this.activeIndex() - 1;
      this.scrollTo(targetIndex);
    } else {
      this.onScroll();
    }

    if (this.autoPlay()) {
      this.startAutoPlay();
    }
  }

  protected scrollTo(index: number): void {
    const el = this.track()?.nativeElement;
    if (!el) return;

    const target = Math.max(0, Math.min(index, this.count() - 1));
    el.scrollTo({ left: target * this.itemStep(el), behavior: 'smooth' });
  }

  protected step(direction: -1 | 1): void {
    this.scrollTo(this.activeIndex() + direction);
  }

  /** Distance from one item's start to the next, including the flex gap. */
  private itemStep(el: HTMLElement): number {
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return 0;

    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
    return first.offsetWidth + gap;
  }

  /** Watches the track and every item, so a reflow at any width re-measures. */
  private syncObserved(): void {
    const el = this.track()?.nativeElement;
    if (!el || !this.observer) return;

    this.observer.disconnect();
    this.observer.observe(el);
    for (const child of Array.from(el.children)) {
      this.observer.observe(child);
    }

    this.measureActive();
  }

  /**
   * Publishes the active item's natural height.
   *
   * Safe against feedback: the fitted track sets `align-items: flex-start`, so
   * writing a height back to the track cannot change the height of the child
   * being measured.
   */
  private measureActive(): void {
    const el = this.track()?.nativeElement;
    const child = el?.children.item(this.activeIndex()) as HTMLElement | null;
    if (child) this.activeHeight.set(child.offsetHeight);
  }
}
