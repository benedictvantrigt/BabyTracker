export type DashboardCardId = 'timers' | 'sleep' | 'feeding' | 'diaper' | 'records' | 'today';

export const DASHBOARD_CARDS: Record<DashboardCardId, { title: string; description: string }> = {
  timers: { title: 'Running timers', description: 'Live clock and stop button for running timers' },
  sleep: { title: 'Sleep', description: 'Awake since, next nap, start sleep' },
  feeding: { title: 'Feeding', description: 'Last feed, next due, left / right / bottle' },
  diaper: { title: 'Diapers', description: 'Last change, one-tap wet / solid / both' },
  records: {
    title: 'More records',
    description: 'Tummy time timer; pumping, temperature and growth',
  },
  today: { title: "Today's totals", description: 'Feeds, diapers and sleep so far today' },
};

export const ALL_CARDS = Object.keys(DASHBOARD_CARDS) as DashboardCardId[];

/**
 * Today-screen layout: every card in one fixed order, plus the cards that are turned off.
 * A turned-off card keeps its place, so turning it back on restores it there.
 */
export interface DashboardLayout {
  order: DashboardCardId[];
  off: DashboardCardId[];
}

export const DEFAULT_DASHBOARD: DashboardLayout = { order: [...ALL_CARDS], off: [] };

function validIds(ids: unknown): DashboardCardId[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<DashboardCardId>();
  for (const id of ids) {
    if (typeof id === 'string' && id in DASHBOARD_CARDS) seen.add(id as DashboardCardId);
  }
  return [...seen];
}

/**
 * Makes a stored layout complete: drops unknown and duplicate ids and appends cards the
 * layout does not list (a card added in a newer version shows at the bottom).
 * A list of ids is the layout of versions up to 0.5: the visible cards in order. The cards
 * missing from it were hidden; they move to the bottom, turned off.
 */
export function normalizeDashboard(stored: unknown): DashboardLayout {
  if (Array.isArray(stored)) {
    const visible = validIds(stored);
    const off = ALL_CARDS.filter((id) => !visible.includes(id));
    return { order: [...visible, ...off], off };
  }
  if (typeof stored !== 'object' || stored === null) return DEFAULT_DASHBOARD;
  const { order, off } = stored as { order?: unknown; off?: unknown };
  const listed = validIds(order);
  return {
    order: [...listed, ...ALL_CARDS.filter((id) => !listed.includes(id))],
    off: validIds(off),
  };
}

/** The cards the Today screen shows, in display order. */
export function visibleCards(layout: DashboardLayout): DashboardCardId[] {
  return layout.order.filter((id) => !layout.off.includes(id));
}

export function isCardOn(layout: DashboardLayout, id: DashboardCardId): boolean {
  return !layout.off.includes(id);
}

/** Moves a card, on or off, one place up (-1) or down (+1); no-op at the ends. */
export function moveCard(
  layout: DashboardLayout,
  id: DashboardCardId,
  delta: -1 | 1,
): DashboardLayout {
  const from = layout.order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...layout, order };
}

/** Turns a card on or off; it keeps its place in the order. */
export function setCardVisible(
  layout: DashboardLayout,
  id: DashboardCardId,
  visible: boolean,
): DashboardLayout {
  const off = layout.off.filter((x) => x !== id);
  return { ...layout, off: visible ? off : [...off, id] };
}
