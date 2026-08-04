import { Component, ChangeDetectionStrategy, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RemindersService } from '@core/services/reminders.service';

export interface CalendarDay {
  date: Date;
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  hasReminder: boolean;
  reminderTone?: string;
}

@Component({
  selector: 'app-calendar-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-widget.component.html',
  styleUrl: './calendar-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarWidgetComponent implements OnInit {
  private readonly remindersService = inject(RemindersService);

  // Current view reference point (can be changed by arrows)
  currentDate = signal<Date>(new Date());
  
  // The selected day in the UI
  selectedDate = signal<Date>(new Date());

  // Derive reminders list
  reminders = computed(() => this.remindersService.reminders() || []);

  // Derived month and year for the header
  monthYear = computed(() => {
    return this.currentDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  // Derived list of days for the full month grid
  monthDays = computed<CalendarDay[]>(() => {
    const baseDate = this.currentDate();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const today = new Date();
    const selected = this.selectedDate();
    const currentReminders = this.reminders();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    
    const days: CalendarDay[] = [];
    
    // Pad previous month days (Sunday = 0, Monday = 1, etc.)
    const startingDayOfWeek = firstDay.getDay(); // 0-6
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push(this.createCalendarDay(date, false, today, selected, currentReminders));
    }
    
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      days.push(this.createCalendarDay(date, true, today, selected, currentReminders));
    }
    
    // Pad next month days to complete the grid (usually up to 6 rows = 42 days, but we can just do enough to fill the last row)
    const totalDaysSoFar = days.length;
    const remainingDays = totalDaysSoFar % 7 === 0 ? 0 : 7 - (totalDaysSoFar % 7);
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push(this.createCalendarDay(date, false, today, selected, currentReminders));
    }
    
    return days;
  });

  ngOnInit() {
    // Initial fetch if not already loaded by priority-reminders component
    // though the dashboard probably already fires it. It's safe to call it again if we want to ensure it.
  }

  private createCalendarDay(
    date: Date, 
    isCurrentMonth: boolean, 
    today: Date, 
    selected: Date, 
    reminders: any[]
  ): CalendarDay {
    const isToday = this.isSameDate(date, today);
    const isSelected = this.isSameDate(date, selected);
    
    // Check for reminders on this date
    // Compare at day granularity
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    let hasReminder = false;
    let reminderTone = '';
    
    for (const r of reminders) {
      if (r.dueOn && r.dueOn.startsWith(dateStr)) {
        hasReminder = true;
        reminderTone = r.tone;
        break; // Just grab the tone of the first highest priority reminder on this day
      }
    }

    return {
      date,
      dayNumber: date.getDate(),
      isToday,
      isSelected,
      isCurrentMonth,
      hasReminder,
      reminderTone
    };
  }

  selectDate(day: CalendarDay) {
    this.selectedDate.set(day.date);
  }

  previousMonth() {
    const newDate = new Date(this.currentDate());
    newDate.setMonth(newDate.getMonth() - 1);
    this.currentDate.set(newDate);
  }

  nextMonth() {
    const newDate = new Date(this.currentDate());
    newDate.setMonth(newDate.getMonth() + 1);
    this.currentDate.set(newDate);
  }

  private isSameDate(d1: Date, d2: Date): boolean {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }
}
