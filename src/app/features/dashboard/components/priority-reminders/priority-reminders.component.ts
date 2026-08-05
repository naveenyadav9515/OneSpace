import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  afterNextRender,
} from '@angular/core';
import { RemindersService } from '@core/services/reminders.service';
import { SectionCardComponent, CarouselComponent, IconTileComponent } from '@shared/components';

/**
 * Priority Reminders carousel on the home screen.
 *
 * Each card shows its icon tile, a toned category chip, description, and a
 * two-column footer with the due date and days-until countdown. The carousel
 * is powered by the shared `CarouselComponent` so it gets swipe, dots and
 * arrow controls for free.
 */
@Component({
  selector: 'app-priority-reminders',
  standalone: true,
  imports: [IconTileComponent],
  templateUrl: './priority-reminders.component.html',
  styleUrl: './priority-reminders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityRemindersComponent {
  protected readonly remindersService = inject(RemindersService);

  protected readonly reminders = computed(() => this.remindersService.reminders());
  
  // Only display the first 3 reminders so the dashboard doesn't get flooded
  protected readonly visibleReminders = computed(() => this.reminders()?.slice(0, 3) ?? null);
  
  // Track how many are hidden to display in a 'View All' button
  protected readonly hiddenCount = computed(() => Math.max(0, (this.reminders()?.length ?? 0) - 3));

  constructor() {
    afterNextRender(() => {
      this.remindersService.fetch().subscribe();
    });
  }

  /** Format ISO date to "DD Mon" */
  protected formatDueDate(iso: string): { day: string; month: string } {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { day: '--', month: '---' };
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    return { day, month };
  }

  /** Days until the due date. */
  protected daysUntil(iso: string): number {
    return this.remindersService.daysUntil(iso);
  }
}
