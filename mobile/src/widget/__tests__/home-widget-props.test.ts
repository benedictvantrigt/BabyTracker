/// <reference types="jest" />
import { at, entry, kid, settings } from '@/domain/__tests__/fixtures';

import { homeWidgetProps, pendingTaps, tapAction, withoutNulls } from '../home-widget-props';
import { WIDGET_ACTION } from '../widget-action';

const URI = 'napchime://entry/feeding';

describe('homeWidgetProps', () => {
  it('asks to open the app before a baby is added', () => {
    const p = homeWidgetProps(null, [], settings, at(11), URI);
    expect(p.childName).toBeNull();
    expect(p.taps).toEqual([]);
    expect(p.feedingUri).toBe(URI);
  });

  it('gives running timers their start, so the widget counts them up', () => {
    const entries = [
      entry('feeding', at(12, 40), null, { type: 'breast_milk', method: 'right' }),
      entry('sleep', at(12, 5), null, { nap: true }),
      entry('diaper', at(12, 0), at(12, 0), { wet: true, solid: false }),
    ];
    const micky = kid('Micky', '2026-06-20');
    const p = homeWidgetProps(micky, entries, settings, at(12, 45), URI, 'Wet');
    expect(p.childName).toBe('Micky');
    expect(p.feeding.since).toBe(at(12, 40));
    expect(p.sleep).toMatchObject({ title: 'Asleep since 12:05', since: at(12, 5) });
    expect(p.diaper.since).toBeNull();
    expect(p.sleeping).toBe(true);
    expect(p.confirmed).toBe('Wet');
    expect(p.light.sleep).not.toBe(p.dark.sleep);
    expect(p.awakeSince).toBeNull();
  });

  it('gives the totals, the latest entries and the awake time', () => {
    const entries = [
      entry('feeding', at(9), at(9, 20), { type: 'breast_milk', method: 'left' }),
      entry('sleep', at(10), at(11, 30), { nap: true }),
      entry('diaper', at(12), at(12), { wet: true, solid: true }),
    ];
    const p = homeWidgetProps(kid('Micky', '2026-06-20'), entries, settings, at(12, 30), URI);
    expect(p.totals).toBe('1 feed · 1h 30m sleep · 1 diaper');
    expect(p.recent.map((r) => r.at)).toEqual(['12:00', '10:00', '09:00']);
    expect(p.recent[1].text).toBe('Nap · 1h 30m');
    expect(p.awakeSince).toBe(at(11, 30));
  });
});

describe('withoutNulls', () => {
  it('drops null values at any depth, so UserDefaults keeps the timeline', () => {
    const p = withoutNulls(homeWidgetProps(null, [], settings, at(11), URI));
    expect(JSON.stringify(p)).not.toContain('null');
    expect(p.childName).toBeUndefined();
    expect(p.feeding).toEqual({ title: '', detail: '' });
    expect(withoutNulls({ a: [1, null, { b: null, c: 0, d: '' }], e: false })).toEqual({
      a: [1, { c: 0, d: '' }],
      e: false,
    });
  });
});

describe('pendingTaps', () => {
  it('collects the taps of every timeline entry once, oldest first, and skips junk', () => {
    const a = { id: 'a', target: 'sleep', at: 20 } as const;
    const b = { id: 'b', target: 'wet', at: 10 } as const;
    const timeline = [
      { props: { taps: [a] } },
      { props: { taps: [a, b, { id: 'c', target: 'feed', at: 5 }, null] } },
      { props: {} },
    ];
    expect(pendingTaps(timeline as never)).toEqual([b, a]);
  });
});

describe('tapAction', () => {
  it('maps the widget buttons onto the shared tap handling', () => {
    expect(tapAction('sleep')).toEqual({ action: WIDGET_ACTION.toggleSleep });
    expect(tapAction('wet').data).toEqual({ wet: true, solid: false, label: 'Wet' });
    expect(tapAction('solid').data).toEqual({ wet: false, solid: true, label: 'Solid' });
    expect(tapAction('both').data).toEqual({ wet: true, solid: true, label: 'Wet + solid' });
  });
});
