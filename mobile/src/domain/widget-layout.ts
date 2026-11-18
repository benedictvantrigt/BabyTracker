/**
 * What a home-screen widget shows. Each widget on the home screen has its own layout, chosen
 * on the widget's settings screen (when it is added, or later by long-pressing it). The size
 * then decides how much of that fits: see `widgetView`.
 */
export type WidgetRow = 'feeding' | 'sleep' | 'diaper';

export const WIDGET_ROWS: readonly WidgetRow[] = ['feeding', 'sleep', 'diaper'];

export interface WidgetLayout {
  /** Rows to show, in the fixed order feeding, sleep, diaper; at least one. */
  rows: WidgetRow[];
  /** Show the latest entry next to the buttons; false gives buttons only. */
  showInfo: boolean;
}

export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = { rows: [...WIDGET_ROWS], showInfo: true };

/** A stored layout, cleaned up: unknown rows dropped, order fixed, never empty. */
export function normalizeWidgetLayout(value: unknown): WidgetLayout {
  if (!value || typeof value !== 'object') return { ...DEFAULT_WIDGET_LAYOUT };
  const v = value as Partial<WidgetLayout>;
  const chosen = Array.isArray(v.rows) ? v.rows : [];
  const rows = WIDGET_ROWS.filter((r) => chosen.includes(r));
  return {
    rows: rows.length ? rows : [...WIDGET_ROWS],
    showInfo: typeof v.showInfo === 'boolean' ? v.showInfo : true,
  };
}

/** How the widget is drawn at its current size. */
export type WidgetView =
  /** One big button: the first chosen row's main action (1×1). */
  | { kind: 'single'; row: WidgetRow }
  /** Buttons only, one line per row, or all on one line when the widget is one row high. */
  | { kind: 'buttons'; lines: WidgetRow[][] }
  /** A row per kind with the latest entry and its buttons. */
  | { kind: 'rows'; rows: WidgetRow[] };

/** Height of one widget row, and the width a row needs to show the latest entry, in dp. */
const ROW_HEIGHT = 46;
const INFO_MIN_WIDTH = 200;

/**
 * Fits a layout into a widget of `width` × `height` dp: small widgets drop the latest-entry
 * text first, then rows that don't fit, down to a single button.
 */
export function widgetView(layout: WidgetLayout, width: number, height: number): WidgetView {
  const { rows } = normalizeWidgetLayout(layout);
  const fit = Math.max(1, Math.floor((height - 16) / ROW_HEIGHT));
  if (width < 130 || (fit === 1 && width < INFO_MIN_WIDTH && rows.length > 1)) {
    return { kind: 'single', row: rows[0] };
  }
  const infoFits = layout.showInfo && width >= INFO_MIN_WIDTH;
  if (infoFits && (rows.length <= fit || fit > 1)) {
    return { kind: 'rows', rows: rows.slice(0, fit) };
  }
  if (rows.length <= fit) return { kind: 'buttons', lines: rows.map((r) => [r]) };
  return { kind: 'buttons', lines: [rows] };
}
