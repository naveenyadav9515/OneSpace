import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reminder } from '../models/reminder.model';

/**
 * Priority reminders for the home screen.
 *
 * There is no reminders endpoint yet, so the data below is fixture data. The
 * shape of this service is the point: it exposes the same `signal` + `fetch()`
 * surface as `ExpenseService`, so when the API lands the only change is swapping
 * the `of(...)` for an `http.get(...)` and mapping the response into `Reminder`.
 * Nothing that consumes this service has to know which of those it is talking
 * to, and no component holds a hardcoded reminder.
 */
@Injectable({ providedIn: 'root' })
export class RemindersService {
  /** Latest reminders, highest priority first. Null until the first fetch. */
  public readonly reminders = signal<Reminder[] | null>(null);
  public readonly isLoading = signal(false);

  /**
   * Loads the user's active reminders.
   *
   * @returns the reminders, also pushed onto the `reminders` signal
   */
  public fetch(): Observable<Reminder[]> {
    this.isLoading.set(true);

    // TODO(api): replace with `this.http.get<ApiResponse<Reminder[]>>(...)`
    // once the reminders endpoint exists. Everything below this line stays.
    return of(this.fixtures()).pipe(
      tap((list) => {
        this.reminders.set([...list].sort((a, b) => b.priority - a.priority));
        this.isLoading.set(false);
      }),
    );
  }

  /**
   * Days between now and a due date, rounded up.
   *
   * Lives here rather than in the card so the countdown and the ordering agree,
   * and so a single definition of "today" is used for both.
   */
  public daysUntil(dueOn: string): number {
    const due = new Date(dueOn);
    if (Number.isNaN(due.getTime())) return 0;

    // Compare at day granularity — otherwise something due late tonight reads
    // as "0 days" from the morning, which looks like it has already lapsed.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfDue = new Date(due);
    startOfDue.setHours(0, 0, 0, 0);

    return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  }

  /**
   * Placeholder data, dated relative to today so the countdowns stay plausible
   * however long this runs before the API arrives.
   */
  private fixtures(): Reminder[] {
    const inDays = (n: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString();
    };

    return [
      {
        id: 'r1',
        title: 'Health Insurance Renewal',
        description: 'HDFC Ergo policy expires soon',
        category: 'High Priority',
        icon: 'verified_user',
        tone: 'blue',
        dueOn: inDays(5),
        priority: 100,
      },
      {
        id: 'r2',
        title: "Mom's Birthday",
        description: 'Don’t forget to wish your mom',
        category: 'Personal',
        icon: 'cake',
        tone: 'amber',
        dueOn: inDays(8),
        priority: 90,
      },
      {
        id: 'r3',
        title: 'Electricity Bill',
        description: 'APSPDCL bill due this week',
        category: 'Bills',
        icon: 'bolt',
        tone: 'cyan',
        dueOn: inDays(3),
        priority: 80,
      },
      {
        id: 'r4',
        title: 'Car Service',
        description: 'Scheduled maintenance at 45,000 km',
        category: 'Vehicle',
        icon: 'directions_car',
        tone: 'violet',
        dueOn: inDays(12),
        priority: 60,
      },
      {
        id: 'r5',
        title: 'Rent Collection',
        description: 'Collect rent from the first-floor tenant',
        category: 'Finance',
        icon: 'home_work',
        tone: 'green',
        dueOn: inDays(15),
        priority: 50,
      },
    ];
  }
}
