/**
 * The category hues an item can carry, one per `--lm-tone-*` token.
 *
 * Lives with the models rather than with the icon-tile component that renders
 * it, because domain records choose their own tone — a reminder is amber
 * because it is personal, not because of anything the tile decided. Keeping the
 * type here lets `Reminder` and `RoutineItem` name a tone without importing
 * component code, so the dependency runs models → components and never back.
 */
export type IconTone =
  | 'cyan'
  | 'violet'
  | 'purple'
  | 'amber'
  | 'pink'
  | 'blue'
  | 'rose'
  | 'green';
