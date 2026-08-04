import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { IconTone } from '@core/models/icon-tone.model';

// Re-exported so call sites can pull the tile and its tone type from one place.
// `export type` is required: `isolatedModules` compiles each file alone and
// cannot tell a type-only re-export from a value one.
export type { IconTone };

/** Tile footprints used across the home screen. */
export type IconTileSize = 'sm' | 'md' | 'lg';

/**
 * A Material Symbol inside a rounded, tinted tile.
 *
 * The single most repeated shape on the home screen — section headers, reminder
 * cards, routine rows and the overview mini-cards all use it. Pulling it out
 * means a tone change is one attribute rather than a hand-written background,
 * border and glow at every call site.
 *
 * The fill, border and glow are derived from one `--lm-tone-*` token with
 * `color-mix()` rather than stored as paired tokens. Adding a category is then a
 * single token, and a tone stays internally consistent by construction — the
 * tint can never drift out of step with the icon colour.
 */
@Component({
  selector: 'app-icon-tile',
  standalone: true,
  templateUrl: './icon-tile.component.html',
  styleUrl: './icon-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"tile tone-" + tone() + " size-" + size()',
    '[class.is-filled]': 'filled()',
  },
})
export class IconTileComponent {
  /** Material Symbols ligature name, e.g. `shield`, `cake`, `directions_run`. */
  readonly icon = input.required<string>();

  readonly tone = input<IconTone>('cyan');

  readonly size = input<IconTileSize>('md');

  /**
   * Solid tone background with a contrasting glyph, instead of the default
   * tinted wash. Used where the tile is the focal point rather than a label.
   */
  readonly filled = input(false);
}
