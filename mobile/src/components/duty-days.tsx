import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
  toggleDutyDay,
  type Weekday,
} from '@/domain/duty-days';
import { useTheme } from '@/hooks/use-theme';

/**
 * "My days": one row of day chips, Monday first. Like SavedSwitch, a tapped chip keeps its
 * new state until the saved value follows, and goes back when the save fails.
 */
export function DutyDaysRow({
  days,
  onChange,
}: {
  days: Weekday[];
  onChange: (days: Weekday[]) => unknown;
}) {
  const theme = useTheme();
  const key = days.join(',');
  const [pending, setPending] = useState<{ from: string; to: Weekday[] } | null>(null);
  const shown = pending && pending.from === key ? pending.to : days;

  const toggle = (day: Weekday) => {
    const next = toggleDutyDay(shown, day);
    setPending({ from: key, to: next });
    Promise.resolve(onChange(next)).then(
      (ok) => ok === false && setPending(null),
      () => setPending(null),
    );
  };

  return (
    <View style={styles.wrap}>
      <ThemedText>My days</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Reminders and timer notifications on this phone only on these days. A day runs from day
        start to the next day start.
      </ThemedText>
      <View style={styles.chips}>
        {WEEKDAY_ORDER.map((day) => {
          const on = shown.includes(day);
          return (
            <Pressable
              key={day}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={WEEKDAY_NAMES[day]}
              testID={`duty-day-${day}`}
              onPress={() => toggle(day)}
              hitSlop={2}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: on ? theme.tint : theme.backgroundSelected,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: on ? theme.onTint : theme.text }}>
                {WEEKDAY_NAMES[day].slice(0, 2)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  chip: {
    flex: 1,
    minHeight: 36,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
