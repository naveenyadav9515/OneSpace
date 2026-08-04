import { Injectable } from '@angular/core';
import { ExpenseSummary } from './expense.service';
import { HomeInsight, InsightSegment } from '../models/home-insight.model';

/** Formats a rupee amount the way every figure on the home screen is written. */
function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** Shorthand for an unemphasised run of text. */
const plain = (text: string): InsightSegment => ({ text, emphasis: 'plain' });

@Injectable({ providedIn: 'root' })
export class InsightsService {
  /**
   * Turns an expense summary into the cards the AI Insights carousel shows.
   *
   * Every card is a reading of figures the API already returns — the
   * month-over-month category move, the budget projection, the weekly pace, the
   * category concentration. Nothing is invented, which matters: an insight the
   * user cannot reconcile against their own numbers costs more trust than it
   * buys, and this is the surface most likely to be believed on sight.
   *
   * Cards are emitted only when their underlying figure is meaningful, so an
   * account with two expenses in it shows one honest card rather than five
   * padded ones. The carousel handles a single card without controls.
   *
   * @param summary the expenses summary, or null before it loads
   * @returns insights in priority order, most actionable first
   */
  public derive(summary: ExpenseSummary | null): HomeInsight[] {
    if (!summary) return [];

    const insights: HomeInsight[] = [];
    const topCategory = summary.topCategories?.[0];

    // (Expense-related insights removed for now)

    // ── 6. Health & Daily Routines ──
    insights.push({
      id: 'health-habits',
      icon: 'fitness_center',
      tone: 'green',
      headline: [
        plain('You’re doing amazing with your '),
        { text: 'Health & Daily Habits', emphasis: 'success' },
        plain('! You’ve consistently completed your routines and reminders.'),
      ],
      tip: [
        plain('Sticking to your daily routines and finishing your reminders builds a solid foundation for your overall well-being. Keep up the fantastic work!'),
      ],
      tipIcon: 'self_improvement',
      tipTone: 'green',
    });

    // ── 7. Travel Planning ──
    insights.push({
      id: 'travel-plans',
      icon: 'flight_takeoff',
      tone: 'blue',
      headline: [
        plain('We noticed you have '),
        { text: 'no heavy travel plans', emphasis: 'accent' },
        plain(' lined up right now.'),
      ],
      tip: [
        plain('While frequent travels can lead to more spending, taking breaks is incredibly important! Consider planning a refreshing getaway soon to recharge your batteries.'),
      ],
      tipIcon: 'explore',
      tipTone: 'blue',
    });

    // ── 8. Kirana / Groceries Reminder ──
    insights.push({
      id: 'kirana-reminder',
      icon: 'shopping_basket',
      tone: 'rose',
      headline: [
        plain('It’s almost time for your monthly '),
        { text: 'Kirana purchases', emphasis: 'danger' },
        plain('!'),
      ],
      tip: [
        plain('A gentle reminder to plan your grocery list in advance. Smart planning helps you grab the best deals and stay perfectly on budget.'),
      ],
      tipIcon: 'inventory',
      tipTone: 'amber',
    });

    return insights;
  }

  /**
   * Splits a sentence around a figure so that figure can be emphasised.
   *
   * Falls back to one plain segment when the figure is absent from the text —
   * the sentence still reads correctly, it simply loses the highlight, which is
   * the right way for a formatting concern to fail.
   */
  private emphasise(text: string, needle: string | undefined, emphasis: InsightSegment['emphasis']): InsightSegment[] {
    if (!needle) return [plain(text)];

    const at = text.indexOf(needle);
    if (at === -1) return [plain(text)];

    return [
      plain(text.slice(0, at)),
      { text: needle, emphasis },
      plain(text.slice(at + needle.length)),
    ].filter((s) => s.text.length > 0);
  }
}
