import { IconTone } from './icon-tone.model';

/**
 * A single scheduled block in the day's routine.
 *
 * One row of the Daily Routine timeline: time on the left, tinted icon, title
 * and detail in the middle, completion toggle on the right.
 */
export interface RoutineItem {
  /** Stable identifier; the `track` key for the timeline. */
  id: string;
  /**
   * Start time as 24-hour `HH:mm`.
   *
   * Not a `Date`: a routine repeats daily and has no date of its own, and
   * storing one would make today's schedule quietly wrong tomorrow. The 24-hour
   * form also sorts lexicographically, so ordering needs no parsing.
   */
  time: string;
  /** Headline, e.g. "Morning Workout". */
  title: string;
  /** Optional duration, e.g. "35 mins". */
  duration?: string;
  /** Optional qualifier, e.g. "Treadmill". */
  note?: string;
  /** Material Symbols icon name for the row's tile. */
  icon: string;
  /** Drives the tile, the timeline dot and the completion ring together. */
  tone: IconTone;
  /** Whether the block has been checked off today. */
  done: boolean;
}
