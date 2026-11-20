'use no memo';
// Rendered to a picture by react-native-android-widget: only its own primitives work here.
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import type { WidgetLine, WidgetSummary } from '@/domain/widget';
import { WIDGET_ROWS, type WidgetRow, type WidgetView } from '@/domain/widget-layout';

export const SUMMARY_WIDGET = 'Summary';

/** Click actions handled by the widget task (besides the library's OPEN_APP / OPEN_URI). */
export const WIDGET_ACTION = {
  toggleSleep: 'TOGGLE_SLEEP',
  logDiaper: 'LOG_DIAPER',
} as const;

type Palette = (typeof Colors)['light' | 'dark'];

/** The full widget: every row with the latest entry (the size Android suggests, 4×2). */
export const FULL_VIEW: WidgetView = { kind: 'rows', rows: [...WIDGET_ROWS] };

interface Action {
  label: string;
  clickAction: string;
  clickActionData?: Record<string, unknown>;
}

const diaper = (label: string, wet: boolean, solid: boolean): Action => ({
  label,
  clickAction: WIDGET_ACTION.logDiaper,
  // The label comes back with the tap, so the widget can confirm this very button.
  clickActionData: { wet, solid, label },
});

/** The buttons of a row, its main action first. */
function rowActions(row: WidgetRow, summary: WidgetSummary, feedingUri: string): Action[] {
  switch (row) {
    case 'feeding':
      return [{ label: 'Feed', clickAction: 'OPEN_URI', clickActionData: { uri: feedingUri } }];
    case 'sleep':
      return [
        { label: summary.sleeping ? 'Wake' : 'Sleep', clickAction: WIDGET_ACTION.toggleSleep },
      ];
    case 'diaper':
      return [diaper('Wet', true, false), diaper('Solid', false, true)];
  }
}

export function SummaryWidget({
  summary,
  feedingUri,
  dark,
  view = FULL_VIEW,
  confirmed,
}: {
  summary: WidgetSummary | null;
  /** Deep link that opens the feeding entry screen. */
  feedingUri: string;
  dark: boolean;
  /** What fits at the widget's size, from its layout (`widgetView`). */
  view?: WidgetView;
  /** Label of the button just tapped: drawn with a check mark until the next redraw. */
  confirmed?: string;
}) {
  const c: Palette = dark ? Colors.dark : Colors.light;
  const small = view.kind === 'single';
  const root = {
    height: 'match_parent',
    width: 'match_parent',
    backgroundColor: c.background as ColorProp,
    borderRadius: 20,
    padding: small ? 6 : 10,
    flexGap: 6,
  } as const;

  if (!summary) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ ...root, justifyContent: 'center', alignItems: 'center' }}>
        <TextWidget
          text={small ? 'Open Napchime' : 'Open Napchime to add your baby'}
          style={{ fontSize: small ? 12 : 14, color: c.textSecondary as ColorProp }}
        />
      </FlexWidget>
    );
  }

  const label = `Napchime: ${summary.childName}`;

  if (view.kind !== 'rows') {
    // Buttons only: one line per entry of `lines`; a single button is the main action.
    const lines =
      view.kind === 'single'
        ? [[{ row: view.row, action: rowActions(view.row, summary, feedingUri)[0] }]]
        : view.lines.map((line) =>
            line.flatMap((row) =>
              rowActions(row, summary, feedingUri).map((action) => ({ row, action })),
            ),
          );
    return (
      <FlexWidget style={root} accessibilityLabel={label}>
        {lines.map((line) => (
          <FlexWidget
            key={line.map((b) => b.action.label).join('-')}
            style={{ flex: 1, width: 'match_parent', flexDirection: 'row', flexGap: 6 }}>
            {line.map(({ row, action }) => (
              <WidgetButton
                key={action.label}
                {...action}
                c={c}
                color={c[row]}
                fill
                done={action.label === confirmed}
              />
            ))}
          </FlexWidget>
        ))}
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={root} accessibilityLabel={label}>
      {view.rows.map((row) => (
        <Row key={row} line={summary[row]} color={c[row]} c={c}>
          {rowActions(row, summary, feedingUri).map((action) => (
            <WidgetButton
              key={action.label}
              {...action}
              c={c}
              color={c[row]}
              done={action.label === confirmed}
            />
          ))}
        </Row>
      ))}
    </FlexWidget>
  );
}

function Row({
  line,
  color,
  c,
  children,
}: {
  line: WidgetLine;
  color: string;
  c: Palette;
  children: React.ReactNode;
}) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        flexGap: 6,
        backgroundColor: c.backgroundElement as ColorProp,
        borderRadius: 14,
        paddingHorizontal: 10,
      }}>
      <FlexWidget clickAction="OPEN_APP" style={{ flex: 1 }}>
        <TextWidget
          text={line.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 14, fontWeight: '600', color: color as ColorProp }}
        />
        {line.detail ? (
          <TextWidget
            text={line.detail}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, color: c.textSecondary as ColorProp }}
          />
        ) : null}
      </FlexWidget>
      {children}
    </FlexWidget>
  );
}

/**
 * A button. In a row it is a small grey pill; without the latest entry (`fill`) it grows to
 * fill its line and takes the row's colour for its label, so feed, sleep and diaper stay
 * apart. Just tapped (`done`) it fills with that colour and shows a check mark, at once,
 * while the sync after the tap may still take seconds.
 */
function WidgetButton({
  label,
  c,
  clickAction,
  clickActionData,
  color,
  fill = false,
  done = false,
}: Action & { c: Palette; color?: string; fill?: boolean; done?: boolean }) {
  const background = done && color ? color : fill ? c.backgroundElement : c.backgroundSelected;
  const text = done && color ? c.background : fill && color ? color : c.text;
  return (
    <FlexWidget
      clickAction={clickAction}
      clickActionData={clickActionData}
      accessibilityLabel={label}
      style={{
        backgroundColor: background as ColorProp,
        borderRadius: 12,
        paddingHorizontal: fill ? 6 : 12,
        paddingVertical: 8,
        ...(fill
          ? ({
              flex: 1,
              height: 'match_parent',
              justifyContent: 'center',
              alignItems: 'center',
            } as const)
          : {}),
      }}>
      <TextWidget
        text={done ? `✓ ${label}` : label}
        maxLines={1}
        style={{
          fontSize: fill ? 15 : 13,
          fontWeight: '600',
          color: text as ColorProp,
        }}
      />
    </FlexWidget>
  );
}
