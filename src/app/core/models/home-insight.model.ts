import { IconTone } from './icon-tone.model';

/**
 * How a run of insight text should be emphasised.
 *
 * Insight sentences carry one or two figures that are the whole point of the
 * sentence — an overspend, a saving, a projection — and they have to stand out
 * from the words around them. Splitting the sentence into typed segments lets
 * the template style those runs without any HTML in the data, so nothing here
 * ever needs `innerHTML` and untrusted text can never become markup.
 */
export type InsightEmphasis = 'plain' | 'danger' | 'success' | 'accent';

/** One run of text within an insight sentence. */
export interface InsightSegment {
  text: string;
  emphasis: InsightEmphasis;
}

/**
 * A single card in the AI Insights carousel.
 *
 * Every insight is derived from figures the expenses API already returns —
 * none of this is invented. When a real recommendation engine lands it replaces
 * the derivation, not this shape.
 */
export interface HomeInsight {
  /** Stable identifier; the `track` key for the carousel. */
  id: string;
  /** Material Symbols icon for the card's large tile. */
  icon: string;
  tone: IconTone;
  /** The observation, e.g. "You spent ₹2,540 more on dining…". */
  headline: InsightSegment[];
  /** Optional follow-up suggestion shown under the divider. */
  tip?: InsightSegment[];
  /** Icon for the tip's small badge. */
  tipIcon?: string;
  tipTone?: IconTone;
}
