/// <reference types="jest" />
import { DEFAULT_WIDGET_LAYOUT, normalizeWidgetLayout, widgetView } from '../widget-layout';

const all = DEFAULT_WIDGET_LAYOUT;
const buttonsOnly = { ...all, showInfo: false };

describe('normalizeWidgetLayout', () => {
  it('keeps known rows in the fixed order and never ends up empty', () => {
    expect(normalizeWidgetLayout({ rows: ['diaper', 'feeding', 'x'], showInfo: false })).toEqual({
      rows: ['feeding', 'diaper'],
      showInfo: false,
    });
    expect(normalizeWidgetLayout({ rows: [] })).toEqual(all);
    expect(normalizeWidgetLayout(null)).toEqual(all);
  });
});

describe('widgetView', () => {
  it('shows every row with the latest entry at the suggested 4×2 size', () => {
    expect(widgetView(all, 300, 160)).toEqual({
      kind: 'rows',
      rows: ['feeding', 'sleep', 'diaper'],
    });
  });

  it('drops rows that do not fit', () => {
    expect(widgetView(all, 300, 110)).toEqual({ kind: 'rows', rows: ['feeding', 'sleep'] });
  });

  it('puts every button on one line when the widget is one row high', () => {
    expect(widgetView(all, 300, 60)).toEqual({
      kind: 'buttons',
      lines: [['feeding', 'sleep', 'diaper']],
    });
  });

  it('keeps the latest entry in a one-row widget with a single row', () => {
    expect(widgetView({ rows: ['sleep'], showInfo: true }, 300, 60)).toEqual({
      kind: 'rows',
      rows: ['sleep'],
    });
  });

  it('shows buttons only when the latest entries are turned off', () => {
    expect(widgetView(buttonsOnly, 300, 160)).toEqual({
      kind: 'buttons',
      lines: [['feeding'], ['sleep'], ['diaper']],
    });
    expect(widgetView(buttonsOnly, 300, 60)).toEqual({
      kind: 'buttons',
      lines: [['feeding', 'sleep', 'diaper']],
    });
  });

  it('drops the latest entry when the widget is too narrow for it', () => {
    expect(widgetView(all, 160, 160)).toEqual({
      kind: 'buttons',
      lines: [['feeding'], ['sleep'], ['diaper']],
    });
  });

  it('is a single button for the first chosen row at 1×1', () => {
    expect(widgetView(all, 70, 70)).toEqual({ kind: 'single', row: 'feeding' });
    expect(widgetView({ rows: ['sleep', 'diaper'], showInfo: true }, 70, 70)).toEqual({
      kind: 'single',
      row: 'sleep',
    });
    expect(widgetView(all, 160, 60)).toEqual({ kind: 'single', row: 'feeding' });
  });
});
