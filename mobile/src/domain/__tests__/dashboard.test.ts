/// <reference types="jest" />
import { DEFAULT_DASHBOARD, moveCard, normalizeDashboard, setCardVisible } from '../dashboard';

describe('dashboard layout', () => {
  it('normalizes stored layouts', () => {
    expect(normalizeDashboard(undefined)).toEqual(DEFAULT_DASHBOARD);
    expect(normalizeDashboard('diaper')).toEqual(DEFAULT_DASHBOARD);
    expect(normalizeDashboard(['diaper', 'weather', 'diaper', 7, 'sleep'])).toEqual([
      'diaper',
      'sleep',
    ]);
    expect(normalizeDashboard([])).toEqual([]);
  });

  it('moves cards one step and stops at the ends', () => {
    const ids = ['sleep', 'feeding', 'diaper'] as const;
    expect(moveCard([...ids], 'diaper', -1)).toEqual(['sleep', 'diaper', 'feeding']);
    expect(moveCard([...ids], 'sleep', 1)).toEqual(['feeding', 'sleep', 'diaper']);
    expect(moveCard([...ids], 'sleep', -1)).toEqual([...ids]);
    expect(moveCard([...ids], 'diaper', 1)).toEqual([...ids]);
    expect(moveCard([...ids], 'today', 1)).toEqual([...ids]);
  });

  it('shows cards at the bottom and hides them', () => {
    expect(setCardVisible(['diaper'], 'sleep', true)).toEqual(['diaper', 'sleep']);
    expect(setCardVisible(['diaper', 'sleep'], 'sleep', true)).toEqual(['diaper', 'sleep']);
    expect(setCardVisible(['diaper', 'sleep'], 'diaper', false)).toEqual(['sleep']);
  });
});
