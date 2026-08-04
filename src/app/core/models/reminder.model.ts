import { IconTone } from './icon-tone.model';

/**
 * Reminder domain model.
 *
 * Shaped to what the Priority Reminders card renders, and deliberately not to
 * whatever a future reminders API happens to return — the service is where that
 * translation belongs, so the card never has to change when the backend lands.
 */
export interface Reminder {
  /** Stable identifier; the `track` key for the carousel. */
  id: string;
  /** Headline, e.g. "Health Insurance Renewal". */
  title: string;
  /** Supporting line, e.g. "HDFC Ergo policy expires soon". */
  description: string;
  /** Chip text, e.g. "High Priority" or "Personal". */
  category: string;
  /** Material Symbols icon name for the card's tile. */
  icon: string;
  /** Drives the tile, chip and border so one card reads as a single object. */
  tone: IconTone;
  /**
   * When it falls due, as an ISO date string.
   *
   * Stored as a date rather than a pre-rendered "In 5 Days" so the countdown
   * stays correct without the data being refetched — a cached reminder that
   * still claims five days a week later is worse than no reminder.
   */
  dueOn: string;
  /** Ranks the carousel; higher surfaces first. */
  priority: number;
}
