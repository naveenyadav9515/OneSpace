import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * AI Assistant input bar on the home screen.
 *
 * Provides a text input field and a sparkle icon.
 */
@Component({
  selector: 'app-ai-assistant-input',
  standalone: true,
  templateUrl: './ai-assistant-input.component.html',
  styleUrl: './ai-assistant-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAssistantInputComponent {}
