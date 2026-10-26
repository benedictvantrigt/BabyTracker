export type DashboardCardId = 'timers' | 'sleep' | 'feeding' | 'diaper' | 'today';

export const DASHBOARD_CARDS: Record<DashboardCardId, { title: string; description: string }> = {
  timers: { title: 'Running timers', description: 'Live clock and stop button for running timers' },
  sleep: { title: 'Sleep', description: 'Awake since, next nap, start sleep' },
  feeding: { title: 'Feeding', description: 'Last feed, next due, left / right / bottle' },
  diaper: { title: 'Diapers', description: 'Last change, one-tap wet / solid / both' },
  today: { title: "Today's totals", description: 'Feeds, diapers and sleep so far today' },
};

export const ALL_CARDS = Object.keys(DASHBOARD_CARDS) as DashboardCardId[];

/** Visible cards in display order. */
export const DEFAULT_DASHBOARD: DashboardCardId[] = [
  'timers',
  'sleep',
  'feeding',
  'diaper',
  'today',
];

/** Drops unknown and duplicate ids, e.g. from a stored layout written by another app version. */
export function normalizeDashboard(ids: unknown): DashboardCardId[] {
  if (!Array.isArray(ids)) return DEFAULT_DASHBOARD;
  const seen = new Set<DashboardCardId>();
  for (const id of ids) {
    if (typeof id === 'string' && id in DASHBOARD_CARDS) seen.add(id as DashboardCardId);
  }
  return [...seen];
}

/** Moves a visible card one place up (-1) or down (+1); no-op at the ends. */
export function moveCard(
  ids: DashboardCardId[],
  id: DashboardCardId,
  delta: -1 | 1,
): DashboardCardId[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Shows a card (appended at the bottom) or hides it. */
export function setCardVisible(
  ids: DashboardCardId[],
  id: DashboardCardId,
  visible: boolean,
): DashboardCardId[] {
  if (visible) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((x) => x !== id);
}
