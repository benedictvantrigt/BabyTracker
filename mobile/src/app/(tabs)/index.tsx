import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, DateTimeField, Field, Icon, KIND_ICON } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAction, useAppData, useEntries, useNow } from '@/data/app-data';
import {
  KIND_LABEL,
  entryTitle,
  feedingLabel,
  isNapStart,
  lastCompletedSleep,
  latest,
  runningEntries,
  summarizeDay,
} from '@/domain/entries';
import { nextFeedAt, nextNapAt } from '@/domain/reminders';
import {
  DAY,
  formatAge,
  formatAgo,
  formatClock,
  formatDuration,
  formatStopwatch,
  startOfLocalDay,
  toIsoDate,
} from '@/domain/time';
import type { Child, DiaperData, Entry, FeedingMethod } from '@/domain/types';
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
  const theme = useTheme();
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

  const running = runningEntries(entries);
  const sleeping = running.find((e) => e.kind === 'sleep');
  const lastSleep = lastCompletedSleep(entries);
  const lastFeed = latest(entries, 'feeding');
  const lastDiaper = latest(entries, 'diaper');
  const napAt = nextNapAt(entries, settings);
  const feedAt = nextFeedAt(entries, settings);
  const today = summarizeDay(entries, now);

  const startFeed = (method: FeedingMethod) =>
    run(async () => {
      const e = await repo.startTimer(child.id, 'feeding', { type: 'breast_milk', method });
      logged(e, `Feeding (${method}) started`);
    });
  const logDiaper = (data: DiaperData, label: string) =>
    run(async () => {
      const t = Date.now();
      const e = await repo.addEntry(child.id, { kind: 'diaper', start: t, end: t, data });
      logged(e, `Diaper logged: ${label}`);
    });
  const startSleep = () =>
    run(async () => {
      const e = await repo.startTimer(child.id, 'sleep', { nap: isNapStart(Date.now(), settings) });
      logged(e, 'Sleep started');
    });

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={[styles.content, styles.section]}>
        <View>
          <ThemedText type="subtitle">{child.name}</ThemedText>
          {child.birthDate && (
            <ThemedText themeColor="textSecondary">{formatAge(child.birthDate, now)}</ThemedText>
          )}
        </View>

        {running.map((e) => (
          <RunningTimer
            key={e.id}
            entry={e}
            now={now}
            onStop={() => run(() => repo.stopEntry(e.id))}
          />
        ))}

        <KindCard kind="sleep" onAdd={() => router.push('/entry/sleep')}>
          <ThemedText>
            {sleeping
              ? `Asleep since ${formatClock(sleeping.start)}`
              : lastSleep?.end != null
                ? `Awake ${formatDuration(now - lastSleep.end)} (since ${formatClock(lastSleep.end)})`
                : 'No sleep logged yet'}
          </ThemedText>
          {!sleeping && napAt && (
            <ThemedText type="small" themeColor="textSecondary">
              {napAt > now
                ? `Nap due at ${formatClock(napAt)}`
                : `Nap was due ${formatAgo(napAt, now)}`}
            </ThemedText>
          )}
          {!sleeping && (
            <Button
              label="Start sleep"
              variant="primary"
              color={theme.sleep}
              onPress={startSleep}
            />
          )}
        </KindCard>

        <KindCard kind="feeding" onAdd={() => router.push('/entry/feeding')}>
          <ThemedText>
            {lastFeed
              ? `Last: ${feedingLabel(lastFeed.data)}, ${formatAgo(lastFeed.start, now)}`
              : 'No feeding logged yet'}
          </ThemedText>
          {feedAt && (
            <ThemedText type="small" themeColor="textSecondary">
              Next due at {formatClock(feedAt)}
            </ThemedText>
          )}
          <View style={styles.buttonRow}>
            <Button label="Left" style={styles.grow} onPress={() => startFeed('left')} />
            <Button label="Right" style={styles.grow} onPress={() => startFeed('right')} />
            <Button
              label="Bottle"
              style={styles.grow}
              onPress={() =>
                router.push({
                  pathname: '/entry/[kind]',
                  params: { kind: 'feeding', method: 'bottle' },
                })
              }
            />
          </View>
        </KindCard>

        <KindCard kind="diaper" onAdd={() => router.push('/entry/diaper')}>
          <ThemedText>
            {lastDiaper
              ? `Last change ${formatAgo(lastDiaper.start, now)}`
              : 'No diaper change logged yet'}
          </ThemedText>
          <View style={styles.buttonRow}>
            <Button
              label="Wet"
              style={styles.grow}
              onPress={() => logDiaper({ wet: true, solid: false }, 'wet')}
            />
            <Button
              label="Solid"
              style={styles.grow}
              onPress={() => logDiaper({ wet: false, solid: true }, 'solid')}
            />
            <Button
              label="Both"
              style={styles.grow}
              onPress={() => logDiaper({ wet: true, solid: true }, 'wet + solid')}
            />
          </View>
        </KindCard>

        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TODAY
          </ThemedText>
          <View style={styles.statsRow}>
            <Stat
              label="Feeds"
              value={String(today.feedings)}
              sub={today.bottleMl ? `${today.bottleMl} ml` : undefined}
            />
            <Stat
              label="Diapers"
              value={String(today.diapers)}
              sub={`${today.wet} wet · ${today.solid} solid`}
            />
            <Stat label="Sleep" value={formatDuration(today.sleepMs)} sub={`${today.naps} naps`} />
          </View>
        </Card>
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

function useKindColor(kind: Entry['kind']): string {
  return useTheme()[kind];
}

function KindCard({
  kind,
  onAdd,
  children,
}: {
  kind: Entry['kind'];
  onAdd: () => void;
  children: ReactNode;
}) {
  const color = useKindColor(kind);
  return (
    <Card>
      <View style={styles.cardHeader}>
        <Icon name={KIND_ICON[kind]} color={color} />
        <ThemedText type="smallBold" style={[styles.grow, { color }]}>
          {KIND_LABEL[kind].toUpperCase()}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${KIND_LABEL[kind]} entry`}
          onPress={onAdd}
          hitSlop={12}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            + Add
          </ThemedText>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}

function RunningTimer({ entry, now, onStop }: { entry: Entry; now: number; onStop: () => void }) {
  const theme = useTheme();
  const color = theme[entry.kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${entryTitle(entry)}`}
      onPress={() =>
        router.push({ pathname: '/entry/[kind]', params: { kind: entry.kind, id: entry.id } })
      }>
      <Card style={[styles.running, { borderColor: color }]}>
        <View style={styles.cardHeader}>
          <Icon name={KIND_ICON[entry.kind]} color={color} />
          <View style={styles.grow}>
            <ThemedText type="smallBold">{entryTitle(entry)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Since {formatClock(entry.start)}
            </ThemedText>
          </View>
          <ThemedText style={styles.stopwatch}>{formatStopwatch(now - entry.start)}</ThemedText>
        </View>
        <Button
          label="Stop"
          variant="primary"
          color={color}
          icon={{ ios: 'stop.fill', android: 'stop' }}
          onPress={onStop}
        />
      </Card>
    </Pressable>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.grow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
      {sub && (
        <ThemedText type="small" themeColor="textSecondary">
          {sub}
        </ThemedText>
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  running: {
    borderWidth: 2,
  },
  stopwatch: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statValue: {
    fontSize: 20,
    lineHeight: 28,
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
