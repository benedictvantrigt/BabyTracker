import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/data/app-data';
import { formatClock, formatDate, formatDayLabel, startOfLocalDay } from '@/domain/time';
import type { EntryKind } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

export const KIND_ICON: Record<EntryKind, SymbolName> = {
  feeding: { ios: 'waterbottle.fill', android: 'local_drink' },
  sleep: { ios: 'moon.zzz.fill', android: 'bedtime' },
  diaper: { ios: 'drop.fill', android: 'baby_changing_station' },
};

export function Icon({
  name,
  color,
  size = 22,
}: {
  name: SymbolName;
  color: string;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export function Card({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  color,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Overrides the fill colour of a primary button. */
  color?: string;
  icon?: SymbolName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const fill =
    variant === 'primary'
      ? (color ?? theme.tint)
      : variant === 'danger'
        ? theme.danger
        : theme.backgroundSelected;
  const text = variant === 'secondary' ? theme.text : theme.onTint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: fill, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}>
      {icon && <Icon name={icon} color={text} size={20} />}
      <ThemedText style={[styles.buttonLabel, { color: text }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: theme.background }]}>
            <ThemedText type={selected ? 'smallBold' : 'small'} numberOfLines={1}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText>{label}</ThemedText>
        {description && (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} testID={testID} />
    </View>
  );
}

export function Stepper({
  label,
  value,
  format,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.rowText}>{label}</ThemedText>
      <View style={styles.stepper}>
        <Button
          label="−"
          onPress={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
        />
        <ThemedText type="smallBold" style={styles.stepperValue}>
          {format(value)}
        </ThemedText>
        <Button
          label="+"
          onPress={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
        />
      </View>
    </View>
  );
}

/** Opens the Android date dialog, followed by the time dialog unless `dateOnly`. */
function pickAndroidDateTime(value: number, dateOnly: boolean, onChange: (ms: number) => void) {
  DateTimePickerAndroid.open({
    value: new Date(value),
    mode: 'date',
    maximumDate: new Date(),
    onValueChange: (_, date) => {
      if (dateOnly) {
        onChange(startOfLocalDay(date.getTime()));
        return;
      }
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: true,
        onValueChange: (_e, time) => onChange(time.getTime()),
      });
    },
  });
}

/** Date + time (or date-only) field that never allows a moment in the future. */
export function DateTimeField({
  value,
  onChange,
  dateOnly = false,
}: {
  value: number;
  onChange: (ms: number) => void;
  dateOnly?: boolean;
}) {
  const theme = useTheme();
  const now = useNow(60_000);
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={new Date(value)}
        mode={dateOnly ? 'date' : 'datetime'}
        display="compact"
        maximumDate={new Date(now)}
        onValueChange={(_, date) =>
          onChange(dateOnly ? startOfLocalDay(date.getTime()) : date.getTime())
        }
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => pickAndroidDateTime(value, dateOnly, onChange)}
      style={[styles.input, { borderColor: theme.border }]}>
      <ThemedText>
        {dateOnly
          ? formatDate(value)
          : `${formatDayLabel(startOfLocalDay(value), now)} · ${formatClock(value)}`}
      </ThemedText>
    </Pressable>
  );
}

/** Time-of-day picker storing minutes after midnight. */
export function TimeOfDayField({
  minute,
  onChange,
}: {
  minute: number;
  onChange: (minute: number) => void;
}) {
  const theme = useTheme();
  const date = new Date();
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  const handle = (d: Date) => onChange(d.getHours() * 60 + d.getMinutes());
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={date}
        mode="time"
        display="compact"
        onValueChange={(_, d) => handle(d)}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          onValueChange: (_, d) => handle(d),
        })
      }
      style={[styles.input, styles.inputCompact, { borderColor: theme.border }]}>
      <ThemedText>{formatClock(date.getTime())}</ThemedText>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonLabel: {
    fontWeight: 600,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: Spacing.two + Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  field: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
  },
  rowText: {
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperValue: {
    minWidth: 64,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  inputCompact: {
    minWidth: 88,
    alignItems: 'center',
  },
});
