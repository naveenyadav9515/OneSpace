import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SwipeableTabsComponent, TabDefinition } from './swipeable-tabs.component';

@Component({
  standalone: true,
  imports: [SwipeableTabsComponent],
  template: `
    <app-swipeable-tabs [tabs]="tabs" [(activeIndex)]="active">
      <section id="p0">Panel zero</section>
      <section id="p1">Panel one <input id="field" type="text" /></section>
      <section id="p2">Panel two</section>
    </app-swipeable-tabs>
  `,
})
class HostComponent {
  readonly tabs: TabDefinition[] = [
    { id: 'log', label: 'Log', icon: 'add_circle' },
    { id: 'history', label: 'History', icon: 'receipt_long' },
    { id: 'pending', label: 'Pending', icon: 'mark_email_unread', badge: 3 },
  ];
  readonly active = signal(0);
}

/**
 * The commit distance is `max(56px, 20% of the viewport)`, so a fixed constant
 * would pass or fail depending on the runner's window size. Derive it instead.
 */
const BELOW_THRESHOLD = 30;

describe('SwipeableTabsComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const el = (selector: string): HTMLElement =>
    fixture.nativeElement.querySelector(selector) as HTMLElement;

  const tabButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));

  const viewport = (): HTMLElement => el('.tab-viewport');

  /** Comfortably past `max(56, width * 0.2)` for whatever width the runner gives us. */
  const pastThreshold = (): number => Math.max(56, viewport().clientWidth * 0.2) + 40;

  /** Drives a full pointer gesture across the viewport. */
  const swipe = (dx: number, dy = 0, target?: HTMLElement): void => {
    const vp = viewport();
    const from = { x: 200, y: 200 };
    const opts = (x: number, y: number) => ({
      pointerId: 1, clientX: x, clientY: y, button: 0, bubbles: true,
    });

    const down = new PointerEvent('pointerdown', opts(from.x, from.y));
    (target ?? vp).dispatchEvent(down);
    // Two moves: the first locks direction, the second applies displacement.
    vp.dispatchEvent(new PointerEvent('pointermove', opts(from.x + dx / 2, from.y + dy / 2)));
    vp.dispatchEvent(new PointerEvent('pointermove', opts(from.x + dx, from.y + dy)));
    vp.dispatchEvent(new PointerEvent('pointerup', opts(from.x + dx, from.y + dy)));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render one tab button per definition', () => {
    expect(tabButtons().length).toBe(3);

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.tab-label') as NodeListOf<HTMLElement>,
    ).map((s) => s.textContent?.trim());
    expect(labels).toEqual(['Log', 'History', 'Pending']);

    const icons = Array.from(
      fixture.nativeElement.querySelectorAll('.tab-icon') as NodeListOf<HTMLElement>,
    ).map((s) => s.textContent?.trim());
    expect(icons).toEqual(['add_circle', 'receipt_long', 'mark_email_unread']);
  });

  it('should show a badge only when the count is non-zero', () => {
    const badges = fixture.nativeElement.querySelectorAll('.tab-badge');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent.trim()).toBe('3');
  });

  it('should activate a tab when its button is clicked', () => {
    tabButtons()[2].click();
    fixture.detectChanges();
    expect(host.active()).toBe(2);
  });

  it('should mark only the active tab as selected', () => {
    tabButtons()[1].click();
    fixture.detectChanges();
    expect(tabButtons().map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('should use a roving tabindex so only the active tab is in the tab order', () => {
    expect(tabButtons().map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    tabButtons()[1].click();
    fixture.detectChanges();
    expect(tabButtons().map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('should link each tab to its panel for assistive technology', () => {
    expect(tabButtons().map((b) => b.id)).toEqual(['tab-log', 'tab-history', 'tab-pending']);
    expect(tabButtons().map((b) => b.getAttribute('aria-controls')))
      .toEqual(['panel-log', 'panel-history', 'panel-pending']);
  });

  describe('keyboard navigation', () => {
    const press = (key: string) => {
      el('[role="tablist"]').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };

    it('should move right and wrap around with ArrowRight', () => {
      press('ArrowRight');
      expect(host.active()).toBe(1);
      press('ArrowRight');
      expect(host.active()).toBe(2);
      press('ArrowRight');
      expect(host.active()).toBe(0);
    });

    it('should move left and wrap around with ArrowLeft', () => {
      press('ArrowLeft');
      expect(host.active()).toBe(2);
    });

    it('should jump to the first and last tab with Home and End', () => {
      press('End');
      expect(host.active()).toBe(2);
      press('Home');
      expect(host.active()).toBe(0);
    });

    it('should ignore unrelated keys', () => {
      press('a');
      expect(host.active()).toBe(0);
    });
  });

  describe('swipe gestures', () => {
    it('should advance a tab when swiped left past the threshold', () => {
      swipe(-pastThreshold());
      expect(host.active()).toBe(1);
    });

    it('should go back a tab when swiped right past the threshold', () => {
      host.active.set(2);
      fixture.detectChanges();
      swipe(pastThreshold());
      expect(host.active()).toBe(1);
    });

    it('should snap back when the swipe is too short', () => {
      swipe(-BELOW_THRESHOLD);
      expect(host.active()).toBe(0);
    });

    it('should not change tabs on a vertical drag, so the page can scroll', () => {
      swipe(-10, -pastThreshold());
      expect(host.active()).toBe(0);
    });

    it('should not move past the last tab', () => {
      host.active.set(2);
      fixture.detectChanges();
      swipe(-pastThreshold());
      expect(host.active()).toBe(2);
    });

    it('should not move before the first tab', () => {
      swipe(pastThreshold());
      expect(host.active()).toBe(0);
    });

    it('should not start a swipe from a text input, which owns its own drag', () => {
      host.active.set(1);
      fixture.detectChanges();
      swipe(-pastThreshold(), 0, el("#field"));
      expect(host.active()).toBe(1);
    });

    it('should clear the drag offset once the gesture ends', () => {
      swipe(-pastThreshold());
      const track = el('.tab-track');
      expect(track.classList.contains('is-dragging')).toBeFalse();
      expect(track.style.transform).toContain('+ 0px');
    });
  });
});
