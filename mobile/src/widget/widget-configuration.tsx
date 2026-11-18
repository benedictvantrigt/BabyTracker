// The home-screen widget's settings screen (Android): opens when a widget is added and from
// the widget's long-press menu ("Reconfigure"). Each widget keeps its own layout on this phone.
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  registerWidgetConfigurationScreen,
  type WidgetConfigurationScreenProps,
} from 'react-native-android-widget';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ToggleRow } from '@/components/ui';
import {
  DEFAULT_WIDGET_LAYOUT,
  WIDGET_ROWS,
  type WidgetLayout,
  type WidgetRow,
} from '@/domain/widget-layout';
import { useTheme } from '@/hooks/use-theme';

import { renderSummary, widgetRepo } from './widget-task';

const ROW_LABEL: Record<WidgetRow, { label: string; description: string }> = {
  feeding: { label: 'Feeding', description: 'Feed button' },
  sleep: { label: 'Sleep', description: 'Sleep and wake button' },
  diaper: { label: 'Diaper', description: 'Wet and solid buttons' },
};

export function WidgetConfigurationScreen({
  widgetInfo,
  renderWidget,
  setResult,
}: WidgetConfigurationScreenProps) {
  const theme = useTheme();
  const [layout, setLayout] = useState<WidgetLayout | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    widgetRepo()
      .then(({ repo }) => repo.getWidgetLayout(widgetInfo.widgetId))
      .then((stored) => live && setLayout(stored))
      .catch(() => live && setLayout({ ...DEFAULT_WIDGET_LAYOUT }));
    return () => {
      live = false;
    };
  }, [widgetInfo.widgetId]);

  /** False (the switch goes back) when it would turn off the last row: one always stays. */
  const toggleRow = (row: WidgetRow, on: boolean): boolean => {
    if (!layout) return false;
    const rows = WIDGET_ROWS.filter((r) => (r === row ? on : layout.rows.includes(r)));
    if (!rows.length) return false;
    setLayout({ ...layout, rows });
    return true;
  };

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      const { repo } = await widgetRepo();
      await repo.setWidgetLayout(widgetInfo.widgetId, layout);
      renderWidget(await renderSummary(repo, widgetInfo, layout));
      setResult('ok');
    } catch (e) {
      console.warn('Saving the widget layout failed', e);
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screen}>
      <ThemedText type="subtitle">Napchime widget</ThemedText>
      <ThemedText themeColor="textSecondary">
        Choose what this widget shows. Make it smaller on the home screen for buttons only, or
        a single button at the smallest size.
      </ThemedText>
      {layout && (
        <>
          <Card>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Rows
            </ThemedText>
            {WIDGET_ROWS.map((row) => (
              <ToggleRow
                key={row}
                label={ROW_LABEL[row].label}
                description={ROW_LABEL[row].description}
                value={layout.rows.includes(row)}
                onChange={(on) => toggleRow(row, on)}
                testID={`widget-row-${row}`}
              />
            ))}
          </Card>
          <Card>
            <ToggleRow
              label="Show latest entries"
              description="Off: buttons only"
              value={layout.showInfo}
              onChange={(showInfo) => setLayout({ ...layout, showInfo })}
              testID="widget-show-info"
            />
          </Card>
        </>
      )}
      <View style={styles.actions}>
        <Button label="Cancel" onPress={() => setResult('cancel')} style={styles.action} />
        <Button
          label="Save"
          variant="primary"
          onPress={save}
          disabled={!layout || saving}
          style={styles.action}
        />
      </View>
    </ScrollView>
  );
}

export function registerWidgetConfiguration(): void {
  if (Platform.OS !== 'android') return;
  registerWidgetConfigurationScreen(WidgetConfigurationScreen);
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 48, gap: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
