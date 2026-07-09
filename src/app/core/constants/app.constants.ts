/**
 * Application-wide constants.
 * Centralizes all user-facing text strings for i18n-readiness (§15.1)
 * and application configuration values.
 */

/** Database connection status type */
export type DbConnectionStatus = 'connecting' | 'connected' | 'error';

/** User-facing text constants (i18n-ready — §15.1: no hardcoded strings) */
export const APP_STRINGS = {
  APP_NAME: 'One-Space',
  APP_BADGE_LABEL: 'Angular App',
  WELCOME_SUBTITLE: 'Welcome to your personal dashboard.',
  DB_LABEL: 'MongoDB Atlas',
  DB_STATUS_CONNECTED: 'Connected',
  DB_STATUS_CONNECTING: 'Connecting...',
  DB_STATUS_ERROR: 'Disconnected',
  FEATURES_SECTION_TITLE: 'Features',
  FEATURE_ON: 'ON',
  FEATURE_OFF: 'OFF',
  FEATURE_COMING_SOON: 'Coming Soon',
  FEATURE_LOG_TITLE: 'Features Log',
  FEATURE_LOG_ADD_BTN: 'Log Feature',
  FEATURE_LOG_CANCEL_BTN: 'Cancel',
  FEATURE_LOG_SAVE_BTN: 'Save Feature',
  FEATURE_LOG_NAME_PLACEHOLDER: 'Feature name',
  FEATURE_LOG_DETAIL_PLACEHOLDER: 'Detail point...',
  FEATURE_LOG_ADD_POINT: '+ Add Point',
  FEATURE_LOG_EMPTY: 'No features logged yet. Tap "Log Feature" to add your first idea!',
} as const;

/** Material Symbols icon names for DB status states */
export const DB_STATUS_ICONS: Record<DbConnectionStatus, string> = {
  connected: 'cloud_done',
  connecting: 'cloud_sync',
  error: 'cloud_off',
} as const;

/** Time-of-day greeting thresholds */
export const GREETING_THRESHOLDS = {
  MORNING_END: 12,
  AFTERNOON_END: 17,
} as const;

/** Greeting messages by time of day */
export const GREETINGS = {
  MORNING: 'Good morning',
  AFTERNOON: 'Good afternoon',
  EVENING: 'Good evening',
  DEFAULT: 'Hello',
} as const;

/** localStorage keys (§5.3: SSR-safe access only) */
export const STORAGE_KEYS = {
  FEATURE_LOGS: 'lm_feature_logs',
  THEME_PREFERENCE: 'lm_theme',
} as const;
