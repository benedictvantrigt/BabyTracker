import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DASHBOARD_CARD_COMPONENTS, type DashboardCardProps } from '@/components/dashboard-cards';
import { Button, Card, DateTimeField, Field, Icon } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAction, useAppData, useEntries, useNow } from '@/data/app-data';
import { DAY, formatAge, startOfLocalDay, toIsoDate } from '@/domain/time';
import type { Child, Entry } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { requestNotificationPermission } from '@/notifications/scheduler';

function showError(message: string) {
  Alert.alert('Could not save', message);
}

export default function TodayScreen() {
  const { activeChild, loaded } = useAppData();
  if (!loaded) return <ThemedView style={styles.fill} />;
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        {activeChild ? (
          <Dashboard child={activeChild} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AddChild />
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function AddChild() {
  const { repo } = useAppData();
  const run = useAction(showError);
  const theme = useTheme();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(() => startOfLocalDay(Date.now()));

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Welcome</ThemedText>
      <ThemedText themeColor="textSecondary">
        Everything you log stays on this phone. Sharing with a partner comes in a later version.
      </ThemedText>
      <Card>
        <Field label="Baby's name">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
            autoFocus
          />
        </Field>
        <Field label="Date of birth">
          <DateTimeField value={birth} onChange={setBirth} dateOnly />
        </Field>
        <Button
          label="Start tracking"
          variant="primary"
          disabled={!name.trim()}
          onPress={async () => {
            if (await run(() => repo.addChild(name, toIsoDate(birth)))) {
              requestNotificationPermission().catch(() => {});
            }
          }}
        />
      </Card>
    </View>
  );
}

interface UndoState {
  message: string;
  entryId: string;
}

function Dashboard({ child }: { child: Child }) {
  const { repo, settings } = useAppData();
  const now = useNow(1000);
  // Yesterday onwards covers "last of each" and today's totals; only changes at midnight.
  const { entries } = useEntries(child.id, startOfLocalDay(now) - DAY);
  const run = useAction(showError);
  const [undo, setUndo] = useState<UndoState | null>(null);

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(id);
  }, [undo]);

  const logged = useCallback(
    (entry: Entry, message: string) => setUndo({ entryId: entry.id, message }),
    [],
  );

  const { textSecondary } = useTheme();
  const cardProps: DashboardCardProps = { child, settings, entries, now, repo, run, logged };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={[styles.content, styles.section]}>
        <View style={styles.header}>
          <View style={styles.grow}>
            <ThemedText type="subtitle">{child.name}</ThemedText>
            {child.birthDate && (
              <ThemedText themeColor="textSecondary">{formatAge(child.birthDate, now)}</ThemedText>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Customize dashboard"
            onPress={() => router.push('/dashboard')}
            hitSlop={12}>
            <Icon name={{ ios: 'slider.horizontal.3', android: 'tune' }} color={textSecondary} />
          </Pressable>
        </View>

        {settings.dashboardCards.map((id) => {
          const CardComponent = DASHBOARD_CARD_COMPONENTS[id];
          return <CardComponent key={id} {...cardProps} />;
        })}

        {settings.dashboardCards.length === 0 && (
          <Card>
            <ThemedText themeColor="textSecondary">All cards are hidden.</ThemedText>
            <Button label="Customize dashboard" onPress={() => router.push('/dashboard')} />
          </Card>
        )}
      </ScrollView>

      {undo && (
        <UndoBanner
          message={undo.message}
          onUndo={() => {
            const id = undo.entryId;
            setUndo(null);
            run(() => repo.deleteEntry(id));
          }}
        />
      )}
    </View>
  );
}

function UndoBanner({ message, onUndo }: { message: string; onUndo: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.undo, { backgroundColor: theme.text }]} accessibilityLiveRegion="polite">
      <ThemedText style={[styles.grow, { color: theme.background }]}>{message}</ThemedText>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={12}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          UNDO
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  undo: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: BottomTabInset + Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
