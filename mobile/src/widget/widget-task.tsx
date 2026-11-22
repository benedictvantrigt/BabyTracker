// Home-screen widget (Android): what it shows and what its buttons do (see widget-actions).
// Runs as a headless JS task when the widget is added, refreshed or tapped, also while the app
// is closed. The iPhone widget is in home-widget.ios.tsx.
import { Platform } from 'react-native';
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetInfo,
  type WidgetRepresentation,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';

import { Repo } from '@/db/repo';
import { DAY, startOfLocalDay } from '@/domain/time';
import { widgetSummary } from '@/domain/widget';
import { widgetView, type WidgetLayout } from '@/domain/widget-layout';

import { updateHomeWidget } from './home-widget-sync';
import { SUMMARY_WIDGET, SummaryWidget } from './summary-widget';
import { afterWidgetWrite, feedingUri, handleClick, serial, widgetRepo } from './widget-actions';

export { widgetRepo };

/**
 * The widget as `info` (one widget on the home screen) should show it: its own layout, or
 * `layout` while its settings screen is open, fitted to its size.
 */
export async function renderSummary(
  repo: Repo,
  info: Pick<WidgetInfo, 'widgetId' | 'width' | 'height'>,
  layout?: WidgetLayout,
  now = Date.now(),
  /** Label of the button just tapped, drawn with a check mark as a quick confirmation. */
  confirmed?: string,
): Promise<WidgetRepresentation> {
  const [settings, children, stored] = await Promise.all([
    repo.getSettings(),
    repo.listChildren(),
    layout ? Promise.resolve(layout) : repo.getWidgetLayout(info.widgetId),
  ]);
  const view = widgetView(stored, info.width, info.height);
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0];
  // From yesterday's midnight: last night, today's naps and the latest of each kind.
  const entries = child ? await repo.listEntries(child.id, startOfLocalDay(now) - DAY) : [];
  const summary = child ? widgetSummary(child, entries, settings, now) : null;
  const uri = feedingUri();
  return {
    light: (
      <SummaryWidget
        summary={summary}
        feedingUri={uri}
        dark={false}
        view={view}
        confirmed={confirmed}
      />
    ),
    dark: (
      <SummaryWidget summary={summary} feedingUri={uri} dark view={view} confirmed={confirmed} />
    ),
  };
}

// Clicks only come from the widget's own buttons: the library's receiver is not exported,
// so other apps cannot send it WIDGET_CLICK (#42; CI checks the APK's manifest).

/** How long a tapped button keeps its check mark. */
const CONFIRM_MS = 2_500;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { repo, inApp } = await widgetRepo();
  if (props.widgetAction === 'WIDGET_DELETED') {
    await repo.deleteWidgetLayout(props.widgetInfo.widgetId);
    return;
  }
  if (props.widgetAction === 'WIDGET_CLICK') {
    const { wrote, confirmed } = await serial(() =>
      handleClick(repo, props.clickAction, props.clickActionData),
    );
    // Show the result first: reminders and the sync with the relay can take seconds.
    const shownAt = Date.now();
    props.renderWidget(await renderSummary(repo, props.widgetInfo, undefined, shownAt, confirmed));
    if (wrote) await afterWidgetWrite(repo, inApp);
    if (!confirmed) return;
    await pause(CONFIRM_MS - (Date.now() - shownAt));
  }
  props.renderWidget(await renderSummary(repo, props.widgetInfo));
}

/** Redraws the widgets on the home screen; call after the log or the settings change. */
export async function updateWidgets(repo: Repo): Promise<void> {
  if (Platform.OS === 'ios') return updateHomeWidget(repo);
  if (Platform.OS !== 'android') return;
  await requestWidgetUpdate({
    widgetName: SUMMARY_WIDGET,
    renderWidget: (info) => renderSummary(repo, info),
  });
}

export function registerWidgetTask(): void {
  if (Platform.OS !== 'android') return;
  registerWidgetTaskHandler(widgetTaskHandler);
}
