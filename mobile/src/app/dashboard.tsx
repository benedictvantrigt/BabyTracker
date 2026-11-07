import type { ComponentProps } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Icon } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAction, useAppData } from '@/data/app-data';
import {
  DASHBOARD_CARDS,
  DEFAULT_DASHBOARD,
  isCardOn,
  moveCard,
  setCardVisible,
  type DashboardCardId,
  type DashboardLayout,
} from '@/domain/dashboard';
import { useTheme } from '@/hooks/use-theme';

export default function CustomizeDashboardScreen() {
  const { repo, settings } = useAppData();
  const run = useAction((message) => Alert.alert('Could not save', message));
  const layout = settings.dashboardLayout;
  const save = (dashboardLayout: DashboardLayout) =>
    run(() => repo.updateSettings({ dashboardLayout }));

  return (
    <ThemedView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Choose which cards the Today screen shows and in what order. A card that is turned off
          keeps its place and its data, and its settings are hidden from the Settings tab; reminders
          keep working.
        </ThemedText>

        <Card>
          {layout.order.map((id, index) => (
            <CardRow
              key={id}
              id={id}
              visible={isCardOn(layout, id)}
              onToggle={(on) => save(setCardVisible(layout, id, on))}
              onUp={index > 0 ? () => save(moveCard(layout, id, -1)) : undefined}
              onDown={
                index < layout.order.length - 1 ? () => save(moveCard(layout, id, 1)) : undefined
              }
            />
          ))}
        </Card>

        <Button label="Reset to default" onPress={() => save(DEFAULT_DASHBOARD)} />
      </ScrollView>
    </ThemedView>
  );
}

function CardRow({
  id,
  visible,
  onToggle,
  onUp,
  onDown,
}: {
  id: DashboardCardId;
  visible: boolean;
  onToggle: (on: boolean) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { title, description } = DASHBOARD_CARDS[id];
  return (
    <View style={styles.row} testID={`card-row-${id}`}>
      <View style={[styles.grow, !visible && styles.off]}>
        <ThemedText>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <MoveButton
        label={`Move ${title} up`}
        testID={`move-up-${id}`}
        icon={{ ios: 'chevron.up', android: 'arrow_upward' }}
        onPress={onUp}
      />
      <MoveButton
        label={`Move ${title} down`}
        testID={`move-down-${id}`}
        icon={{ ios: 'chevron.down', android: 'arrow_downward' }}
        onPress={onDown}
      />
      <Switch
        value={visible}
        onValueChange={onToggle}
        accessibilityLabel={`Show ${title}`}
        testID={`show-${id}`}
      />
    </View>
  );
}

function MoveButton({
  label,
  icon,
  onPress,
  testID,
}: {
  label: string;
  testID: string;
  icon: ComponentProps<typeof Icon>['name'];
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.move,
        { backgroundColor: theme.backgroundSelected, opacity: !onPress ? 0.3 : pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} color={theme.text} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  grow: {
    flex: 1,
  },
  off: {
    opacity: 0.4,
  },
  move: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two + Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
