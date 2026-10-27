import { router } from 'expo-router';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Icon, KIND_ICON } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Repo } from '@/db/repo';
import type { DashboardCardId } from '@/domain/dashboard';
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
  isNewStage,
  scheduleStatus,
  type ScheduleStatus,
  type SleepAdvice,
  type SlotState,
} from '@/domain/sleep-schedule';
import { MINUTE, formatAgo, formatClock, formatDuration, formatStopwatch } from '@/domain/time';
import type { Child, DiaperData, Entry, FeedingMethod, Settings } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

/** Everything a dashboard card needs; computed once per render of the Today screen. */
export interface DashboardCardProps {
  child: Child;
  settings: Settings;
  entries: Entry[];
  now: number;
  repo: Repo;
  /** Runs a write, showing an alert on failure. */
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  /** Offers an undo for a just-created entry. */
  logged: (entry: Entry, message: string) => void;
}

export const DASHBOARD_CARD_COMPONENTS: Record<
  DashboardCardId,
  ComponentType<DashboardCardProps>
> = {
  timers: TimersCard,
  sleep: SleepCard,
  feeding: FeedingCard,
  diaper: DiaperCard,
  today: TodayCard,
};

function TimersCard({ entries, now, repo, run }: DashboardCardProps) {
  const running = runningEntries(entries);
  if (running.length === 0) return null;
  return (
    <>
      {running.map((e) => (
        <RunningTimer
          key={e.id}
          entry={e}
          now={now}
          onStop={() => run(() => repo.stopEntry(e.id))}
        />
      ))}
    </>
  );
}

function SleepCard({ child, settings, entries, now, repo, run, logged }: DashboardCardProps) {
  const theme = useTheme();
  const sleeping = runningEntries(entries).find((e) => e.kind === 'sleep');
  const lastSleep = lastCompletedSleep(entries);
  const schedule = settings.sleepSchedule ? scheduleStatus(entries, child, settings, now) : null;
  const napAt = schedule ? null : nextNapAt(entries, settings);
  const startSleep = () =>
    run(async () => {
      const e = await repo.startTimer(child.id, 'sleep', {
        nap: isNapStart(Date.now(), settings),
      });
      logged(e, 'Sleep started');
    });

  return (
    <KindCard kind="sleep" onAdd={() => router.push('/entry/sleep')}>
      {schedule && isNewStage(schedule.stage, now) && (
        <ThemedText type="small" style={{ color: theme.sleep }} testID="schedule-new-stage">
          New schedule: {schedule.stage.stage.label}, {schedule.plan.naps.length} naps a day
        </ThemedText>
      )}
      <ThemedText>
        {sleeping
          ? `Asleep since ${formatClock(sleeping.start)}`
          : lastSleep?.end != null
            ? `Awake ${formatDuration(now - lastSleep.end)} (since ${formatClock(lastSleep.end)})`
            : 'No sleep logged yet'}
      </ThemedText>
      {schedule ? (
        <ScheduleLines schedule={schedule} sleeping={!!sleeping} now={now} />
      ) : (
        !sleeping &&
        napAt && (
          <ThemedText type="small" themeColor="textSecondary">
            {napAt > now
              ? `Nap due at ${formatClock(napAt)}`
              : `Nap was due ${formatAgo(napAt, now)}`}
          </ThemedText>
        )
      )}
      {!sleeping && (
        <Button label="Start sleep" variant="primary" color={theme.sleep} onPress={startSleep} />
      )}
      {schedule && <DayPlan schedule={schedule} now={now} />}
    </KindCard>
  );
}

/** Where the day stands: the nap running now or the next one, and advice when off plan. */
function ScheduleLines({
  schedule,
  sleeping,
  now,
}: {
  schedule: ScheduleStatus;
  sleeping: boolean;
  now: number;
}) {
  const theme = useTheme();
  const naps = schedule.plan.naps.length;
  const { current, next } = schedule;
  let line: string;
  if (current) {
    const which = current.slot ? `Nap ${current.slot.index} of ${naps}` : 'Extra nap';
    line =
      current.endAt > now
        ? `${which} · until ${formatClock(current.endAt)} · ${formatDuration(current.endAt - now)} left`
        : `${which} · planned until ${formatClock(current.endAt)}`;
  } else if (sleeping) {
    line = `Night · day starts at ${formatClock(schedule.morningAt)}`;
  } else if (next) {
    line =
      next.startAt > now
        ? `Nap ${next.index} of ${naps} at ${formatClock(next.startAt)} · in ${formatDuration(next.startAt - now)}`
        : `Nap ${next.index} of ${naps} was due at ${formatClock(next.startAt)}`;
  } else if (schedule.plan.bedtimeAt > now) {
    line = `Bed at ${formatClock(schedule.plan.bedtimeAt)} · in ${formatDuration(schedule.plan.bedtimeAt - now)}`;
  } else {
    line = `Bedtime was ${formatClock(schedule.plan.bedtimeAt)}`;
  }
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary" testID="schedule-next">
        {line}
      </ThemedText>
      {schedule.advice && (
        <ThemedText type="small" style={{ color: theme.sleep }} testID="schedule-advice">
          {adviceText(schedule.advice)}
        </ThemedText>
      )}
    </>
  );
}

function adviceText(advice: SleepAdvice): string {
  switch (advice.kind) {
    case 'resettle':
      return `Woke early: try to settle again; the nap runs until ${formatClock(advice.until)}.`;
    case 'catch-up':
      return `Short day sleep: one long or two short naps between ${formatClock(advice.from)} and ${formatClock(advice.to)}.`;
    case 'wake-overdue':
      return `Time to wake up: the nap was planned until ${formatClock(advice.since)}.`;
  }
}

const SLOT_STATUS_LABEL: Record<SlotState['status'], string> = {
  done: 'slept',
  short: 'short',
  missed: 'missed',
  now: 'now',
  sleeping: 'sleeping',
  upcoming: '',
};

/** Today's planned naps and bedtime with what was slept, and day sleep against the target. */
function DayPlan({ schedule, now }: { schedule: ScheduleStatus; now: number }) {
  const [open, setOpen] = useState(false);
  const [min, max] = schedule.stage.stage.daySleep;
  const target =
    min === max
      ? formatDuration(min * MINUTE)
      : `${formatDuration(min * MINUTE)}–${formatDuration(max * MINUTE)}`;
  return (
    <View style={styles.plan}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        testID="schedule-plan">
        <ThemedText type="smallBold" themeColor="textSecondary">
          {`${open ? '▾' : '▸'} Today's plan · ${schedule.stage.stage.label}${schedule.stage.manual ? ' (set by hand)' : ''}`}
        </ThemedText>
        {!open && (
          <ThemedText type="small" themeColor="textSecondary">
            {`${schedule.slots.map((n) => formatClock(n.startAt)).join(' · ')} · bed ${formatClock(schedule.plan.bedtimeAt)}`}
          </ThemedText>
        )}
      </Pressable>
      {open &&
        schedule.slots.map((slot) => (
          <View key={slot.index} style={styles.planRow}>
            <ThemedText type="small" style={styles.grow}>
              {`Nap ${slot.index}  ${formatClock(slot.startAt)}–${formatClock(slot.endAt)}`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {slot.sleptMs > 0
                ? `${formatDuration(slot.sleptMs)} ${SLOT_STATUS_LABEL[slot.status]}`
                : SLOT_STATUS_LABEL[slot.status]}
            </ThemedText>
          </View>
        ))}
      {open && (
        <>
          <View style={styles.planRow}>
            <ThemedText type="small" style={styles.grow}>
              {`Bed  ${formatClock(schedule.plan.bedtimeAt)}`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {schedule.plan.bedtimeAt <= now ? 'past' : ''}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {`Day sleep ${formatDuration(schedule.daySleptMs)} of ${target}`}
          </ThemedText>
        </>
      )}
    </View>
  );
}

function FeedingCard({ child, settings, entries, now, repo, run, logged }: DashboardCardProps) {
  const lastFeed = latest(entries, 'feeding');
  const feedAt = nextFeedAt(entries, settings);
  const startFeed = (method: FeedingMethod) =>
    run(async () => {
      const e = await repo.startTimer(child.id, 'feeding', { type: 'breast_milk', method });
      logged(e, `Feeding (${method}) started`);
    });

  return (
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
  );
}

function DiaperCard({ child, entries, now, repo, run, logged }: DashboardCardProps) {
  const lastDiaper = latest(entries, 'diaper');
  const logDiaper = (data: DiaperData, label: string) =>
    run(async () => {
      const t = Date.now();
      const e = await repo.addEntry(child.id, { kind: 'diaper', start: t, end: t, data });
      logged(e, `Diaper logged: ${label}`);
    });

  return (
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
  );
}

function TodayCard({ entries, now }: DashboardCardProps) {
  const today = summarizeDay(entries, now);
  return (
    <Card testID="card-today">
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
  );
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
  const color = useTheme()[kind];
  return (
    <Card testID={`card-${kind}`}>
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

const styles = StyleSheet.create({
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
  plan: {
    gap: Spacing.one,
  },
  planRow: {
    flexDirection: 'row',
    gap: Spacing.two,
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
});
