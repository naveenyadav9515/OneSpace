import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { ExpenseService } from '@core/services/expense.service';
import { InsightsService } from '@core/services/insights.service';
import { CarouselComponent } from '@shared/components';

/**
 * The AI Insights strip at the top of the home screen.
 *
 * Presentational: it renders whatever `InsightsService` derives from the current
 * expense summary and owns none of that reasoning itself. When a real
 * recommendation engine replaces the derivation, this component does not change.
 *
 * Renders nothing when there are no insights — an empty card reading "no
 * insights yet" is worse than the section not being there, since what sits below
 * it is what the user came for.
 */
@Component({
  selector: 'app-ai-insights',
  standalone: true,
  imports: [CarouselComponent],
  templateUrl: './ai-insights.component.html',
  styleUrl: './ai-insights.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiInsightsComponent {
  private readonly expenseService = inject(ExpenseService);
  private readonly insightsService = inject(InsightsService);

  protected readonly insights = computed(() =>
    this.insightsService.derive(this.expenseService.summary()),
  );
}
