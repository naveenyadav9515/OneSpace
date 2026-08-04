import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconTileComponent, IconTone } from '../icon-tile/icon-tile.component';

/**
 * The bordered panel every home section sits in: tinted icon tile, title, an
 * optional action link on the right, then projected content.
 *
 * Priority Reminders and Daily Routine differ only in their icon, title, link
 * and body — without this they would be two near-identical blocks of card
 * chrome, and a change to the card's border or padding would have to be made in
 * as many places as there are sections.
 *
 * The header is omitted entirely when no title is given, so a section that
 * carries its own heading (the AI insight card) can still use the panel.
 */
@Component({
  selector: 'app-section-card',
  standalone: true,
  imports: [RouterLink, IconTileComponent],
  templateUrl: './section-card.component.html',
  styleUrl: './section-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionCardComponent {
  readonly title = input<string>('');

  /** Material Symbols ligature for the header tile. */
  readonly icon = input<string>('');

  readonly tone = input<IconTone>('cyan');

  /** Right-hand link text, e.g. "View All". Omit to hide the link. */
  readonly actionLabel = input<string>('');

  /** Router path for the action link. Omit to render the label as plain text. */
  readonly actionLink = input<string>('');

  /** Drops the body padding, for sections whose content bleeds to the edge. */
  readonly flush = input(false);
}
