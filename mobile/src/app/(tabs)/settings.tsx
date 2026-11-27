import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Alert, AppState, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import NightAlarm from '../../../modules/night-alarm';
import TimerNotification from '../../../modules/timer-notification';

import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { DutyDaysRow } from '@/components/duty-days';
import { PartnerSyncCard } from '@/components/partner-sync-card';
import {
  Button,
  Card,
  DateTimeField,
  Field,
  Segmented,
  Stepper,
  TimeOfDayField,
  ToggleRow,
} from '@/components/ui';
import { FEEDBACK_EMAIL, PLAY_STORE_URL, PRIVACY_POLICY_URL } from '@/constants/links';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAction, useAppData } from '@/data/app-data';
import { isCardOn } from '@/domain/dashboard';
import { feedbackMailto } from '@/domain/feedback';
import { SCHEDULE_STAGES, planDay, stageFor } from '@/domain/sleep-schedule';
import {
  DAY,
  formatClock,
  formatDuration,
  MINUTE,
  startOfLocalDay,
  toIsoDate,
} from '@/domain/time';
import type { Child, Settings } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { useSync } from '@/sync/app-sync';
import { liveTimerProblem, subscribeLiveTimerProblem } from '@/notifications/live-timers';
import { subscribeTimerReport, timerReport } from '@/notifications/timer-report';
import { requestNightAlarms } from '@/notifications/night-alarms';
import {
  getPermissionState,
  requestExactAlarmPermission,
  requestNotificationPermission,
  type PermissionState,
} from '@/notifications/scheduler';

function showError(message: string) {
  Alert.alert('Could not save', message);
}

const formatMinutes = (m: number) => formatDuration(m * MINUTE);

export default function SettingsScreen() {
  const { repo, settings, activeChild } = useAppData();
  const run = useAction(showError);
  const update = (patch: Partial<Settings>) => run(() => repo.updateSettings(patch));
  const sync = useSync();
  // Settings that belong to a Today-screen card are hidden while that card is turned off.
  const sleepOn = isCardOn(settings.dashboardLayout, 'sleep');
  const feedingOn = isCardOn(settings.dashboardLayout, 'feeding');
  const shared = sync.status.enabled;

  return (
    <TabScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Settings</ThemedText>

        {activeChild && <ChildCard key={activeChild.id} child={activeChild} />}

        <PartnerSyncCard />

        <PermissionsCard />

        {(sleepOn || feedingOn) && (
          <Card testID="settings-daytime">
            <ThemedText type="smallBold" themeColor="textSecondary">
              DAY
            </ThemedText>
            {shared && <SharedNote />}
            <ThemedText type="small" themeColor="textSecondary">
              Sleep starting in this window counts as a nap. Outside it, feeding reminders become
              alarms.
            </ThemedText>
            <View style={styles.row}>
              <ThemedText style={styles.grow}>Day starts</ThemedText>
              <TimeOfDayField
                minute={settings.dayStartMinute}
                onChange={(m) => update({ dayStartMinute: m })}
              />
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.grow}>Day ends</ThemedText>
              <TimeOfDayField
                minute={settings.dayEndMinute}
                onChange={(m) => update({ dayEndMinute: m })}
              />
            </View>
          </Card>
        )}

        {sleepOn && (
          <SleepCard child={activeChild} settings={settings} update={update} shared={shared} />
        )}

        {feedingOn && (
          <Card testID="settings-feeding">
            <ThemedText type="smallBold" themeColor="textSecondary">
              FEEDING
            </ThemedText>
            {shared && <SharedNote />}
            <Stepper
              label="Feed every"
              value={settings.feedIntervalMinutes}
              format={formatMinutes}
              step={15}
              min={60}
              max={8 * 60}
              onChange={(v) => update({ feedIntervalMinutes: v })}
            />
            <ToggleRow
              label="Daytime reminder"
              description="Notification when a feed is due during the day"
              value={settings.feedRemindersDay}
              testID="toggle-feed-day"
              onChange={(v) => update({ feedRemindersDay: v })}
            />
            <ToggleRow
              label="Night alarm"
              description="Alarm when a feed is due at night"
              value={settings.feedAlarmNight}
              onChange={(v) => update({ feedAlarmNight: v })}
            />
            {(settings.feedRemindersDay || settings.feedAlarmNight) &&
              !settings.feedRemindersHere && (
                <ToggleRow
                  label="Feed reminders on this phone"
                  description={OFF_HERE}
                  value={settings.feedRemindersHere}
                  testID="toggle-feed-here"
                  onChange={(v) => update({ feedRemindersHere: v })}
                />
              )}
            <ToggleRow
              label="Reflux timer"
              description="After each milk feed: how long to keep the baby upright, on the Today screen and the lock screen"
              value={settings.refluxTimer}
              testID="toggle-reflux-timer"
              onChange={(v) => update({ refluxTimer: v })}
            />
            {settings.refluxTimer && (
              <Stepper
                label="Keep upright"
                value={settings.refluxMinutes}
                format={formatMinutes}
                step={5}
                min={5}
                max={90}
                onChange={(v) => update({ refluxMinutes: v })}
              />
            )}
          </Card>
        )}

        <ThisPhoneCard
          settings={settings}
          update={update}
          shared={shared}
          sleepOn={sleepOn}
          feedingOn={feedingOn}
        />

        <SupportCard />

        <AboutCard />
      </ScrollView>
    </TabScreen>
  );
}

/**
 * Up to 0.13 each phone could switch nap or feed reminders off for itself; now My days does
 * that. A switch left off still shows, so it can be turned back on.
 */
const OFF_HERE = 'Off on this phone. Turn on to let My days, under This phone, decide instead';

/** Under the heading of a card whose settings partner sync shares. */
function SharedNote() {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      Shared with your partner’s phone.
    </ThemedText>
  );
}

/**
 * Everything that is this phone's own choice, never synced: which days it reminds, how it
 * records, and what it shows on the lock screen.
 */
function ThisPhoneCard({
  settings,
  update,
  shared,
  sleepOn,
  feedingOn,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  shared: boolean;
  sleepOn: boolean;
  feedingOn: boolean;
}) {
  const ringLikeAlarm =
    feedingOn && settings.feedAlarmNight && settings.feedRemindersHere && NightAlarm?.isAvailable();
  return (
    <Card testID="settings-this-phone">
      <ThemedText type="smallBold" themeColor="textSecondary">
        THIS PHONE
      </ThemedText>
      {shared && (
        <ThemedText type="small" themeColor="textSecondary">
          Not shared: your partner’s phone has its own.
        </ThemedText>
      )}
      <DutyDaysRow days={settings.dutyDays} onChange={(d) => update({ dutyDays: d })} />
      {feedingOn && (
        <ToggleRow
          label="Time feeds"
          description={
            settings.feedTimer
              ? 'Left and Right start a timer'
              : 'Left and Right log the feed now, without a length'
          }
          value={settings.feedTimer}
          testID="toggle-feed-timer"
          onChange={(v) => update({ feedTimer: v })}
        />
      )}
      {sleepOn && (
        <ToggleRow
          label="Lock-screen sleep timer"
          description="While the baby sleeps: until when the nap or night should last"
          value={settings.sleepTimer}
          onChange={(v) => update({ sleepTimer: v })}
          testID="toggle-sleep-timer"
        />
      )}
      {sleepOn && (
        <ToggleRow
          label="Lock-screen awake timer"
          description="During the day: time awake, counting down to the next nap or bedtime"
          value={settings.awakeTimer}
          onChange={(v) => update({ awakeTimer: v })}
          testID="toggle-awake-timer"
        />
      )}
      {ringLikeAlarm && (
        <ToggleRow
          label="Ring like an alarm clock"
          description={
            NightAlarm?.authorizationState() === 'denied'
              ? 'Not allowed: turn on Alarms for Napchime in the iPhone Settings app'
              : 'Night feeds ring as an alarm, also in silent mode and Focus'
          }
          value={settings.nightFeedAlarmKit}
          testID="toggle-night-alarmkit"
          onChange={(v) => {
            update({ nightFeedAlarmKit: v });
            if (v) requestNightAlarms();
          }}
        />
      )}
    </Card>
  );
}

/** Feedback and a store rating (#105). A tip jar follows once the store products exist. */
function SupportCard() {
  const sendFeedback = () => {
    const url = feedbackMailto(FEEDBACK_EMAIL, {
      version: Constants.expoConfig?.version ?? null,
      platform: Platform.OS,
      osVersion: Device.osVersion,
      model: Device.modelName,
    });
    Linking.openURL(url).catch(() =>
      Alert.alert('No email app found', `Send your feedback to ${FEEDBACK_EMAIL}.`),
    );
  };
  return (
    <Card testID="settings-support">
      <ThemedText type="smallBold" themeColor="textSecondary">
        SUPPORT NAPCHIME
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Missing something, or did something go wrong? We read every message.
      </ThemedText>
      <Button label="Send feedback" onPress={sendFeedback} />
      {Platform.OS === 'android' && (
        <Button
          label="Rate Napchime"
          onPress={() =>
            Linking.openURL(PLAY_STORE_URL).catch(() =>
              Alert.alert('Could not open Google Play', PLAY_STORE_URL),
            )
          }
        />
      )}
    </Card>
  );
}

/** App version and the privacy policy, which both stores require to be reachable in the app. */
function AboutCard() {
  // iPhone: what the last lock-screen timer update did (#49), until Live Activities work.
  const report = useSyncExternalStore(subscribeTimerReport, timerReport);
  return (
    <Card testID="settings-about">
      <ThemedText type="smallBold" themeColor="textSecondary">
        ABOUT
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {`Napchime ${Constants.expoConfig?.version ?? ''}`.trim()}
      </ThemedText>
      {Platform.OS === 'ios' && (
        <ThemedText type="small" themeColor="textSecondary" selectable>
          {`Lock-screen timer: ${report || 'not updated since the app opened'}`}
        </ThemedText>
      )}
      <Button
        label="Privacy policy"
        onPress={() =>
          Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
            Alert.alert('Could not open the privacy policy', PRIVACY_POLICY_URL),
          )
        }
      />
    </Card>
  );
}

function SleepCard({
  child,
  settings,
  update,
  shared,
}: {
  child: Child | null;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** Partner sync is on: these settings are shared with the partner's phone. */
  shared: boolean;
}) {
  const [now] = useState(() => Date.now());
  const ageStage = child ? stageFor(child, { scheduleStage: '' }, now) : null;
  const stage = child ? stageFor(child, settings, now) : null;
  const picked = SCHEDULE_STAGES.findIndex((s) => s.id === settings.scheduleStage);
  const plan = stage ? planDay(stage.stage, settings, now) : null;
  const useSchedule = settings.sleepSchedule && plan !== null;

  return (
    <Card testID="settings-sleep">
      <ThemedText type="smallBold" themeColor="textSecondary">
        SLEEP
      </ThemedText>
      {shared && <SharedNote />}
      <ThemedText>Plan naps by</ThemedText>
      <Segmented
        options={[
          { value: 'schedule', label: 'Age schedule' },
          { value: 'window', label: 'Awake window' },
        ]}
        value={settings.sleepSchedule ? 'schedule' : 'window'}
        onChange={(v) => update({ sleepSchedule: v === 'schedule' })}
      />
      {settings.sleepSchedule ? (
        <>
          <Stepper
            label="Stage"
            value={picked}
            format={(i) =>
              i < 0
                ? ageStage
                  ? `Auto: ${ageStage.stage.label}`
                  : 'Auto'
                : SCHEDULE_STAGES[i].label
            }
            step={1}
            min={-1}
            max={SCHEDULE_STAGES.length - 1}
            onChange={(i) => update({ scheduleStage: i < 0 ? '' : SCHEDULE_STAGES[i].id })}
          />
          {plan ? (
            <ThemedText type="small" themeColor="textSecondary" testID="schedule-summary">
              {`Naps ${plan.naps.map((n) => `${formatClock(n.startAt)}–${formatClock(n.endAt)}`).join(', ')} · bed ${formatClock(plan.bedtimeAt)}`}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Set the date of birth, or pick a stage, to use the schedule.
            </ThemedText>
          )}
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          A nap is due once the baby has been awake this long.
        </ThemedText>
      )}
      {!useSchedule && (
        <Stepper
          label="Awake window"
          value={settings.awakeWindowMinutes}
          format={formatMinutes}
          step={15}
          min={30}
          max={6 * 60}
          onChange={(v) => update({ awakeWindowMinutes: v })}
        />
      )}
      <ToggleRow
        label="Record night sleep"
        description={
          settings.nightSleep
            ? 'Sleep is timed day and night'
            : 'Only naps are timed: at night no timers run, the bedtime reminder stays'
        }
        value={settings.nightSleep}
        onChange={(v) => update({ nightSleep: v })}
        testID="toggle-night-sleep"
      />
      <ToggleRow
        label="Nap reminders"
        description={
          useSchedule
            ? 'Before each planned nap and bedtime, and when a nap should end'
            : 'When the awake window has passed, during the day'
        }
        value={settings.napReminders}
        onChange={(v) => update({ napReminders: v })}
      />
      {settings.napReminders && useSchedule && (
        <Stepper
          label="Remind before nap"
          value={settings.napLeadMinutes}
          format={formatMinutes}
          step={5}
          min={0}
          max={60}
          onChange={(v) => update({ napLeadMinutes: v })}
        />
      )}
      {settings.napReminders && !settings.napRemindersHere && (
        <ToggleRow
          label="Nap reminders on this phone"
          description={OFF_HERE}
          value={settings.napRemindersHere}
          onChange={(v) => update({ napRemindersHere: v })}
          testID="toggle-nap-here"
        />
      )}
    </Card>
  );
}

function ChildCard({ child }: { child: Child }) {
  const { repo } = useAppData();
  const run = useAction(showError);
  const theme = useTheme();
  const [name, setName] = useState(child.name);
  const [birth, setBirth] = useState<number | null>(() => {
    if (!child.birthDate) return null;
    const [y, m, d] = child.birthDate.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  });
  const [due, setDue] = useState<number | null>(() => {
    if (!child.dueDate) return null;
    const [y, m, d] = child.dueDate.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  });
  const [today] = useState(() => startOfLocalDay(Date.now()));
  const birthIso = birth === null ? null : toIsoDate(birth);
  const dueIso = due === null ? null : toIsoDate(due);
  const dirty =
    name.trim() !== child.name || birthIso !== child.birthDate || dueIso !== child.dueDate;

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        BABY
      </ThemedText>
      <Field label="Name">
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
        />
      </Field>
      <Field label="Date of birth">
        <DateTimeField value={birth ?? today} onChange={setBirth} dateOnly />
      </Field>
      <ToggleRow
        label="Born early"
        description="The sleep schedule then counts age from the due date"
        value={due !== null}
        onChange={(v) => setDue(v ? (birth ?? today) + 28 * DAY : null)}
        testID="toggle-born-early"
      />
      {due !== null && (
        <Field label="Due date">
          <DateTimeField value={due} onChange={setDue} dateOnly allowFuture />
        </Field>
      )}
      {dirty && (
        <Button
          label="Save"
          variant="primary"
          onPress={() =>
            run(() => repo.updateChild(child.id, { name, birthDate: birthIso, dueDate: dueIso }))
          }
        />
      )}
    </Card>
  );
}

function PermissionsCard() {
  const [state, setState] = useState<PermissionState | null>(null);
  const refresh = useCallback(() => {
    getPermissionState().then(setState, () => {});
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  // Android 16+: timers show as Live Updates unless the user turned that off (#51).
  const liveUpdatesOff = Platform.OS === 'android' && TimerNotification?.canPostPromoted?.() === false;
  // iPhone: why iOS refused the Live Activity for a running timer (#49).
  const liveProblem = useSyncExternalStore(subscribeLiveTimerProblem, liveTimerProblem);

  if (!state || (state.notifications && state.exactAlarms && !liveUpdatesOff && !liveProblem)) {
    return null;
  }

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        PERMISSIONS
      </ThemedText>
      {!state.notifications && (
        <>
          <ThemedText type="small">
            Reminders and timers need permission to show notifications.
          </ThemedText>
          <Button
            label="Allow notifications"
            variant="primary"
            onPress={() => requestNotificationPermission().then(refresh)}
          />
        </>
      )}
      {Platform.OS === 'android' && !state.exactAlarms && (
        <>
          <ThemedText type="small">
            Without “Alarms & reminders” access, Android may deliver reminders several minutes late.
          </ThemedText>
          <Button
            label="Allow exact alarms"
            onPress={() =>
              requestExactAlarmPermission()
                .then(refresh)
                .catch((e: Error) => Alert.alert('Not available in this build', e.message))
            }
          />
        </>
      )}
      {liveUpdatesOff && state.notifications && (
        <>
          <ThemedText type="small">
            Live Updates are off for Napchime, so running timers don’t show in the status bar or as a
            card on the lock screen.
          </ThemedText>
          <Button
            label="Allow Live Updates"
            onPress={() => TimerNotification?.openPromotedSettings()}
          />
        </>
      )}
      {liveProblem && (
        <>
          <ThemedText type="small">
            iOS did not show the running timer as a Live Activity, so it shows as a notification.
            Check that Live Activities are on for Napchime. iOS said: {liveProblem}
          </ThemedText>
          <Button label="Open iPhone Settings" onPress={() => Linking.openSettings()} />
        </>
      )}
    </Card>
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
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
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
});
