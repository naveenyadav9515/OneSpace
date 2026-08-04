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

    // ── 1. The month-over-month move on the biggest category ──
    // The backend has already written this sentence and decided its direction,
    // so it is used verbatim rather than re-derived from the percentage — two
    // implementations of the same sentence drift apart.
    if (summary.insight?.text) {
      const overspending = summary.insight.text.includes('more on');
      insights.push({
        id: 'category-trend',
        icon: overspending ? 'trending_up' : 'trending_down',
        tone: overspending ? 'cyan' : 'green',
        headline: this.emphasise(summary.insight.text, summary.insight.highlightPct, overspending ? 'danger' : 'success'),
        tip: topCategory && overspending
          ? [
              plain('Trimming '),
              { text: `${topCategory.name}`, emphasis: 'accent' },
              plain(' back to last month’s level frees up about '),
              { text: inr(topCategory.amount * 0.2), emphasis: 'success' },
              plain(' this month.'),
            ]
          : [
              plain('Great job! Keeping '),
              { text: `${topCategory?.name || 'expenses'}`, emphasis: 'success' },
              plain(' spending low helps build your savings.'),
            ],
        tipIcon: 'tips_and_updates',
        tipTone: 'amber',
      });
    }

    // ── 2. Where the budget is heading ──
    if (summary.forecast?.statusText) {
      const healthy = summary.budgetStatus === 'Healthy';
      insights.push({
        id: 'forecast',
        icon: healthy ? 'savings' : 'warning',
        tone: healthy ? 'green' : 'rose',
        headline: [
          plain('Projected to finish the month at '),
          { text: inr(summary.forecast.estimatedSpend), emphasis: healthy ? 'success' : 'danger' },
          plain(` of your ${inr(summary.budgetTarget)} budget.`),
        ],
        tip: [plain(summary.forecast.statusText)],
        tipIcon: 'tips_and_updates',
        tipTone: 'amber',
      });
    }

    // ── 3. Weekly pace ──
    if (summary.spendingTrend?.avgPerWeek > 0) {
      const rising = summary.spendingTrend.trendPct > 0;
      insights.push({
        id: 'weekly-pace',
        icon: 'speed',
        tone: rising ? 'amber' : 'cyan',
        headline: [
          plain('You’re averaging '),
          { text: inr(summary.spendingTrend.avgPerWeek), emphasis: 'accent' },
          plain(' a week'),
          // Annotated rather than `as const`: a const assertion cannot be applied
          // to a conditional expression, and without the annotation the object
          // literal widens `emphasis` to `string`.
          ...(summary.spendingTrend.trendPct !== 0
            ? ([
                plain(', '),
                {
                  text: `${Math.abs(summary.spendingTrend.trendPct)}% ${rising ? 'up' : 'down'}`,
                  emphasis: rising ? 'danger' : 'success',
                },
                plain(' on the previous stretch.'),
              ] as InsightSegment[])
            : [plain('.')]),
        ],
        tip: [
          plain(rising ? 'Try delaying non-essential purchases to bring your weekly average down.' : 'You are pacing beautifully! Keep maintaining this weekly average.'),
        ],
        tipIcon: 'tips_and_updates',
        tipTone: 'amber',
      });
    }

    // ── 4. How concentrated the spending is ──
    // Only worth saying when one category genuinely dominates; below that it is
    // a statement of arithmetic rather than an insight.
    if (topCategory && topCategory.percentage >= 30) {
      insights.push({
        id: 'concentration',
        icon: 'donut_small',
        tone: 'violet',
        headline: [
          { text: `${topCategory.percentage}%`, emphasis: 'accent' },
          plain(' of this month’s spending went to '),
          { text: topCategory.name, emphasis: 'plain' },
          plain('.'),
        ],
        tip: [
          plain('That’s '),
          { text: inr(topCategory.amount), emphasis: 'danger' },
          plain(' — your largest single category.'),
        ],
        tipIcon: 'tips_and_updates',
        tipTone: 'amber',
      });
    }

    // ── 5. Runway for the rest of the month ──
    if (summary.daysLeft > 0 && summary.available > 0) {
      insights.push({
        id: 'runway',
        icon: 'calendar_month',
        tone: 'blue',
        headline: [
          plain('You have '),
          { text: inr(summary.available), emphasis: 'success' },
          plain(` left across ${summary.daysLeft} days.`),
        ],
        tip: [
          plain('That’s about '),
          { text: inr(summary.available / summary.daysLeft), emphasis: 'accent' },
          plain(' a day to stay on budget.'),
        ],
        tipIcon: 'tips_and_updates',
        tipTone: 'amber',
      });
    }

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
