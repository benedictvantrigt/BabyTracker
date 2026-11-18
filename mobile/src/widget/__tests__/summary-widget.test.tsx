/// <reference types="jest" />
// Builds the widget tree the way the library does before drawing it natively, so a
// widget that would fail on the phone (hooks, unsupported children) fails here.
import { buildWidgetTree as build } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';

import { widgetSummary } from '@/domain/widget';
import type { WidgetView } from '@/domain/widget-layout';
import { at, entry, kid, settings } from '@/domain/__tests__/fixtures';

import { SummaryWidget, WIDGET_ACTION } from '../summary-widget';

type Tree = { type: string; props: Record<string, unknown>; children?: Tree[] };
const buildWidgetTree = build as (widget: unknown) => Tree;

function flatten(tree: Tree): Tree[] {
  return [tree, ...(tree.children ?? []).flatMap(flatten)];
}

describe('SummaryWidget', () => {
  const entries = [
    entry('feeding', at(9, 30), at(9, 50), { type: 'breast_milk', method: 'left' }),
    entry('sleep', at(12, 5), null, { nap: true }),
  ];
  const summary = widgetSummary(kid('Micky', '2026-06-20'), entries, settings, at(12, 30));

  it('builds with texts and click actions', () => {
    for (const dark of [false, true]) {
      const tree = buildWidgetTree(
        <SummaryWidget summary={summary} feedingUri="napchime://entry/feeding" dark={dark} />,
      );
      const nodes = flatten(tree);
      const texts = nodes.filter((n) => n.type === 'TextWidget').map((n) => n.props.text);
      expect(texts).toEqual(
        expect.arrayContaining(['Fed 09:30', 'Asleep since 12:05', 'No diaper yet', 'Wake']),
      );
      const actions = nodes.map((n) => n.props.clickAction).filter(Boolean);
      expect(actions).toEqual(
        expect.arrayContaining(['OPEN_URI', 'OPEN_APP', WIDGET_ACTION.toggleSleep]),
      );
      expect(actions.filter((a) => a === WIDGET_ACTION.logDiaper)).toHaveLength(2);
    }
  });

  const draw = (view: WidgetView) => {
    const nodes = flatten(
      buildWidgetTree(
        <SummaryWidget summary={summary} feedingUri="x://feed" dark={false} view={view} />,
      ),
    );
    return {
      texts: nodes.filter((n) => n.type === 'TextWidget').map((n) => n.props.text),
      actions: nodes.map((n) => n.props.clickAction).filter(Boolean),
    };
  };

  it('shows only the chosen rows', () => {
    const { texts } = draw({ kind: 'rows', rows: ['sleep'] });
    expect(texts).toEqual(expect.arrayContaining(['Asleep since 12:05', 'Wake']));
    expect(texts).not.toEqual(expect.arrayContaining(['Feed']));
    expect(texts).not.toEqual(expect.arrayContaining(['Wet']));
  });

  it('draws buttons only, without the latest entries', () => {
    const { texts, actions } = draw({ kind: 'buttons', lines: [['feeding', 'sleep', 'diaper']] });
    expect(texts).toEqual(['Feed', 'Wake', 'Wet', 'Solid']);
    expect(actions).not.toContain('OPEN_APP');
  });

  it('draws one button at the smallest size', () => {
    expect(draw({ kind: 'single', row: 'sleep' })).toEqual({
      texts: ['Wake'],
      actions: [WIDGET_ACTION.toggleSleep],
    });
  });

  it('asks to open the app when there is no baby yet', () => {
    const tree = buildWidgetTree(<SummaryWidget summary={null} feedingUri="x://" dark={false} />);
    expect(tree.props.clickAction).toBe('OPEN_APP');
  });
});
