/// <reference types="jest" />
import {
  DEFAULT_DASHBOARD,
  isCardOn,
  moveCard,
  normalizeDashboard,
  setCardVisible,
  visibleCards,
  type DashboardLayout,
} from '../dashboard';

describe('dashboard layout', () => {
  it('normalizes stored layouts', () => {
    expect(normalizeDashboard(undefined)).toEqual(DEFAULT_DASHBOARD);
    expect(normalizeDashboard('diaper')).toEqual(DEFAULT_DASHBOARD);
    expect(
      normalizeDashboard({ order: ['diaper', 'weather', 'diaper', 7, 'sleep'], off: ['sleep', 1] }),
    ).toEqual({ order: ['diaper', 'sleep', 'timers', 'feeding', 'today'], off: ['sleep'] });
    // A card the stored layout does not know yet is appended, turned on.
    expect(normalizeDashboard({ order: ['today'], off: [] }).order).toEqual([
      'today',
      'timers',
      'sleep',
      'feeding',
      'diaper',
    ]);
  });

  it('migrates the visible-cards list of older versions', () => {
    expect(normalizeDashboard(['diaper', 'weather', 'diaper', 7, 'sleep'])).toEqual({
      order: ['diaper', 'sleep', 'timers', 'feeding', 'today'],
      off: ['timers', 'feeding', 'today'],
    });
    expect(normalizeDashboard([])).toEqual({
      order: DEFAULT_DASHBOARD.order,
      off: DEFAULT_DASHBOARD.order,
    });
  });

  it('moves cards, on or off, one step and stops at the ends', () => {
    const layout: DashboardLayout = { order: ['sleep', 'feeding', 'diaper'], off: ['feeding'] };
    expect(moveCard(layout, 'diaper', -1).order).toEqual(['sleep', 'diaper', 'feeding']);
    expect(moveCard(layout, 'feeding', -1)).toEqual({
      order: ['feeding', 'sleep', 'diaper'],
      off: ['feeding'],
    });
    expect(moveCard(layout, 'sleep', -1)).toBe(layout);
    expect(moveCard(layout, 'diaper', 1)).toBe(layout);
    expect(moveCard(layout, 'today', 1)).toBe(layout);
  });

  it('turns cards off and on in the same place', () => {
    const layout: DashboardLayout = { order: ['sleep', 'feeding', 'diaper'], off: [] };
    const off = setCardVisible(layout, 'feeding', false);
    expect(off).toEqual({ order: ['sleep', 'feeding', 'diaper'], off: ['feeding'] });
    expect(visibleCards(off)).toEqual(['sleep', 'diaper']);
    expect(isCardOn(off, 'feeding')).toBe(false);
    expect(setCardVisible(off, 'feeding', false)).toEqual(off);
    const on = setCardVisible(off, 'feeding', true);
    expect(on).toEqual(layout);
    expect(visibleCards(on)).toEqual(['sleep', 'feeding', 'diaper']);
  });
});
