/**
 * What a widget button does, on both platforms: on Android the click action the widget task
 * receives (besides the library's OPEN_APP / OPEN_URI), on iOS what a queued tap stands for.
 */
export const WIDGET_ACTION = {
  toggleSleep: 'TOGGLE_SLEEP',
  logDiaper: 'LOG_DIAPER',
} as const;
