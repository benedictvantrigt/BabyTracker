'use no memo';
// Rendered to a picture by react-native-android-widget: only its own primitives work here.
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import type { WidgetLine, WidgetSummary } from '@/domain/widget';

export const SUMMARY_WIDGET = 'Summary';

/** Click actions handled by the widget task (besides the library's OPEN_APP / OPEN_URI). */
export const WIDGET_ACTION = {
  toggleSleep: 'TOGGLE_SLEEP',
  logDiaper: 'LOG_DIAPER',
} as const;

type Palette = (typeof Colors)['light' | 'dark'];

export function SummaryWidget({
  summary,
  feedingUri,
  dark,
}: {
  summary: WidgetSummary | null;
  /** Deep link that opens the feeding entry screen. */
  feedingUri: string;
  dark: boolean;
}) {
  const c: Palette = dark ? Colors.dark : Colors.light;
  const root = {
    height: 'match_parent',
    width: 'match_parent',
    backgroundColor: c.background as ColorProp,
    borderRadius: 20,
    padding: 10,
    flexGap: 6,
  } as const;

  if (!summary) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ ...root, justifyContent: 'center', alignItems: 'center' }}>
        <TextWidget
          text="Open Baby Tracker to add your baby"
          style={{ fontSize: 14, color: c.textSecondary as ColorProp }}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={root} accessibilityLabel={`Baby Tracker: ${summary.childName}`}>
      <Row line={summary.feeding} color={c.feeding} c={c}>
        <WidgetButton
          label="Feed"
          c={c}
          clickAction="OPEN_URI"
          clickActionData={{ uri: feedingUri }}
        />
      </Row>
      <Row line={summary.sleep} color={c.sleep} c={c}>
        <WidgetButton
          label={summary.sleeping ? 'Wake' : 'Sleep'}
          c={c}
          clickAction={WIDGET_ACTION.toggleSleep}
        />
      </Row>
      <Row line={summary.diaper} color={c.diaper} c={c}>
        <WidgetButton
          label="Wet"
          c={c}
          clickAction={WIDGET_ACTION.logDiaper}
          clickActionData={{ wet: true, solid: false }}
        />
        <WidgetButton
          label="Solid"
          c={c}
          clickAction={WIDGET_ACTION.logDiaper}
          clickActionData={{ wet: false, solid: true }}
        />
      </Row>
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

function WidgetButton({
  label,
  c,
  clickAction,
  clickActionData,
}: {
  label: string;
  c: Palette;
  clickAction: string;
  clickActionData?: Record<string, unknown>;
}) {
  return (
    <FlexWidget
      clickAction={clickAction}
      clickActionData={clickActionData}
      accessibilityLabel={label}
      style={{
        backgroundColor: c.backgroundSelected as ColorProp,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}>
      <TextWidget
        text={label}
        style={{ fontSize: 13, fontWeight: '600', color: c.text as ColorProp }}
      />
    </FlexWidget>
  );
}
