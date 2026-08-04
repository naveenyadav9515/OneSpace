import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { SectionCardComponent, IconTileComponent } from '@shared/components';
import { RoutineItem } from '@core/models/daily-routine.model';

/**
 * Daily Routine timeline on the home screen.
 *
 * Displays a vertical list of scheduled blocks for the day — time label on the
 * left, a toned dot on the timeline spine, an icon tile with title and detail,
 * and a completion ring on the right.
 *
 * The data is fixture for now; when a routines API exists the signal will be
 * fed by a service instead.
 */
@Component({
  selector: 'app-daily-routine',
  standalone: true,
  imports: [SectionCardComponent, IconTileComponent],
  templateUrl: './daily-routine.component.html',
  styleUrl: './daily-routine.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyRoutineComponent {
  protected readonly items = signal<RoutineItem[]>([
    {
      id: 'rt1',
      time: '07:00',
      title: 'Morning Workout',
      duration: '35 mins',
      note: 'Treadmill',
      icon: 'fitness_center',
      tone: 'cyan',
      done: true,
    },
    {
      id: 'rt2',
      time: '09:00',
      title: 'Work Time',
      note: 'Focus & productivity',
      icon: 'work',
      tone: 'blue',
      done: false,
    },
    {
      id: 'rt3',
      time: '13:00',
      title: 'Lunch Break',
      duration: '30 mins',
      note: 'Healthy meal',
      icon: 'restaurant',
      tone: 'amber',
      done: false,
    },
    {
      id: 'rt4',
      time: '19:00',
      title: 'Learning Time',
      duration: '30 mins',
      note: 'Skill up',
      icon: 'auto_stories',
      tone: 'purple',
      done: false,
    },
    {
      id: 'rt5',
      time: '21:30',
      title: 'Sleep Time',
      duration: '7–8 hrs',
      note: 'Rest well',
      icon: 'bedtime',
      tone: 'violet',
      done: false,
    },
  ]);

  /** Format 24h time to 12h display split into time and AM/PM */
  protected formatTime(time24: string): { time: string, period: string } {
    const [h, m] = time24.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return {
      time: `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
      period: suffix
    };
  }

  /** Toggle completion */
  protected toggleDone(id: string): void {
    this.items.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
  }
}
