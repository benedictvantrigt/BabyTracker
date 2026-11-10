import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { TagEditor } from '@/components/tags';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, DateTimeField, Field, Segmented, ToggleRow } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAction, useAppData } from '@/data/app-data';
import {
  ENTRY_KINDS,
  FEEDING_METHOD_LABEL,
  KIND_LABEL,
  PUMPING_SIDE_LABEL,
  TEMPERATURE_SITE_LABEL,
  isNapStart,
  isTimedKind,
} from '@/domain/entries';
import { addTag } from '@/domain/tags';
import { MINUTE } from '@/domain/time';
import type {
  DiaperColor,
  Entry,
  EntryInput,
  EntryKind,
  FeedingMethod,
  FeedingType,
  PumpingSide,
  TemperatureSite,
} from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

function options<T extends string>(labels: Record<T, string>, keys: T[]) {
  return keys.map((value) => ({ value, label: labels[value] }));
}

const TYPE_OPTIONS: { value: FeedingType; label: string }[] = [
  { value: 'breast_milk', label: 'Breast' },
  { value: 'formula', label: 'Formula' },
  { value: 'fortified', label: 'Fortified' },
  { value: 'solid', label: 'Solid' },
];
const BREAST_METHODS = options(FEEDING_METHOD_LABEL, ['left', 'right', 'both', 'bottle']);
const OTHER_METHODS = options(FEEDING_METHOD_LABEL, ['bottle', 'self']);
const COLOR_OPTIONS: { value: DiaperColor | 'none'; label: string }[] = [
  { value: 'none', label: '–' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'brown', label: 'Brown' },
  { value: 'green', label: 'Green' },
  { value: 'black', label: 'Black' },
];
const SIDE_OPTIONS = options(PUMPING_SIDE_LABEL, ['left', 'right', 'both']);
const SITE_OPTIONS: { value: TemperatureSite | 'none'; label: string }[] = [
  { value: 'none', label: '–' },
  ...options(TEMPERATURE_SITE_LABEL, ['armpit', 'rectal', 'ear', 'forehead']),
];
/** Minutes a new entry of a timed kind lasts by default. */
const DEFAULT_MINUTES: Partial<Record<EntryKind, number>> = {
  sleep: 60,
  feeding: 15,
  tummy: 10,
  pumping: 15,
};

/** A number typed by hand ("4,25" or "4.25"); undefined when left empty, NaN when invalid. */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  return trimmed ? Number(trimmed) : undefined;
}

function numberText(value: number | undefined, divisor = 1): string {
  return value === undefined ? '' : String(Number((value / divisor).toFixed(3)));
}

interface FormState {
  start: number;
  end: number | null;
  feedingType: FeedingType;
  feedingMethod: FeedingMethod;
  amount: string;
  nap: boolean;
  wet: boolean;
  solid: boolean;
  color: DiaperColor | 'none';
  pumpingSide: PumpingSide;
  celsius: string;
  site: TemperatureSite | 'none';
  /** Kilograms, as typed. */
  weight: string;
  length: string;
  head: string;
  notes: string;
  tags: string[];
  /** A tag typed but not yet added; saved with the entry. */
  tagDraft: string;
}

function initialState(
  kind: EntryKind,
  method: FeedingMethod | undefined,
  napNow: boolean,
): FormState {
  const now = Date.now();
  const defaultLength = (DEFAULT_MINUTES[kind] ?? 0) * MINUTE;
  return {
    start: now - defaultLength,
    end: now,
    feedingType: method === 'bottle' ? 'formula' : 'breast_milk',
    feedingMethod: method ?? 'left',
    amount: '',
    nap: napNow,
    wet: true,
    solid: false,
    color: 'none',
    pumpingSide: 'both',
    celsius: '',
    site: 'none',
    weight: '',
    length: '',
    head: '',
    notes: '',
    tags: [],
    tagDraft: '',
  };
}

function stateFromEntry(entry: Entry): FormState {
  const base = {
    ...initialState(entry.kind, undefined, false),
    start: entry.start,
    end: entry.end,
    notes: entry.notes,
    tags: entry.tags,
  };
  switch (entry.kind) {
    case 'feeding':
      return {
        ...base,
        feedingType: entry.data.type,
        feedingMethod: entry.data.method,
        amount: entry.data.amount ? String(entry.data.amount) : '',
      };
    case 'sleep':
      return { ...base, nap: entry.data.nap };
    case 'diaper':
      return {
        ...base,
        wet: entry.data.wet,
        solid: entry.data.solid,
        color: entry.data.color ?? 'none',
      };
    case 'tummy':
      return base;
    case 'pumping':
      return {
        ...base,
        pumpingSide: entry.data.side,
        amount: entry.data.amount ? String(entry.data.amount) : '',
      };
    case 'temperature':
      return {
        ...base,
        celsius: entry.data.celsius.toFixed(1),
        site: entry.data.site ?? 'none',
      };
    case 'growth':
      return {
        ...base,
        weight: numberText(entry.data.weightGrams, 1000),
        length: numberText(entry.data.lengthCm),
        head: numberText(entry.data.headCm),
      };
  }
}

function toInput(kind: EntryKind, s: FormState): EntryInput {
  const notes = s.notes;
  const tags = addTag(s.tags, s.tagDraft);
  switch (kind) {
    case 'feeding': {
      const amount = s.amount.trim() ? Number(s.amount.replace(',', '.')) : undefined;
      return {
        kind,
        start: s.start,
        end: s.end,
        notes,
        tags,
        data: {
          type: s.feedingType,
          method: s.feedingMethod,
          ...(amount !== undefined && { amount }),
        },
      };
    }
    case 'sleep':
      return { kind, start: s.start, end: s.end, notes, tags, data: { nap: s.nap } };
    case 'diaper':
      return {
        kind,
        start: s.start,
        end: s.start,
        notes,
        tags,
        data: { wet: s.wet, solid: s.solid, ...(s.color !== 'none' && { color: s.color }) },
      };
    case 'tummy':
      return { kind, start: s.start, end: s.end, notes, tags, data: {} };
    case 'pumping': {
      const amount = parseNumber(s.amount);
      return {
        kind,
        start: s.start,
        end: s.end,
        notes,
        tags,
        data: { side: s.pumpingSide, ...(amount !== undefined && { amount }) },
      };
    }
    case 'temperature': {
      // Left empty, it is NaN: validation then explains the range.
      const celsius = Math.round((parseNumber(s.celsius) ?? NaN) * 10) / 10;
      return {
        kind,
        start: s.start,
        end: s.start,
        notes,
        tags,
        data: { celsius, ...(s.site !== 'none' && { site: s.site }) },
      };
    }
    case 'growth': {
      const kg = parseNumber(s.weight);
      const length = parseNumber(s.length);
      const head = parseNumber(s.head);
      return {
        kind,
        start: s.start,
        end: s.start,
        notes,
        tags,
        data: {
          ...(kg !== undefined && { weightGrams: Math.round(kg * 1000) }),
          ...(length !== undefined && { lengthCm: Math.round(length * 10) / 10 }),
          ...(head !== undefined && { headCm: Math.round(head * 10) / 10 }),
        },
      };
    }
  }
}

export default function EntryScreen() {
  const params = useLocalSearchParams<{ kind: string; id?: string; method?: string }>();
  const kind = (ENTRY_KINDS as readonly string[]).includes(params.kind)
    ? (params.kind as EntryKind)
    : null;
  const { repo, activeChild, settings } = useAppData();
  const run = useAction((message) => Alert.alert('Could not save', message));
  const theme = useTheme();
  const [form, setForm] = useState<FormState | null>(() =>
    kind && !params.id
      ? initialState(
          kind,
          params.method as FeedingMethod | undefined,
          isNapStart(Date.now(), settings),
        )
      : null,
  );
  const [missing, setMissing] = useState(false);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  useEffect(() => {
    if (activeChild) repo.listTags(activeChild.id).then(setKnownTags, () => {});
  }, [repo, activeChild]);

  useEffect(() => {
    if (!params.id) return;
    repo
      .getEntry(params.id)
      .then((e) => (e && e.deletedAt === null ? setForm(stateFromEntry(e)) : setMissing(true)));
  }, [repo, params.id]);

  if (!kind || missing) {
    return (
      <ThemedView style={[styles.fill, styles.content]}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <ThemedText>This entry no longer exists.</ThemedText>
      </ThemedView>
    );
  }
  if (!form || !activeChild) return <ThemedView style={styles.fill} />;

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const editing = Boolean(params.id);
  const running = form.end === null;
  const isBreast = form.feedingType === 'breast_milk';
  const timed = isTimedKind(kind);
  const numberInput = (
    value: string,
    onChange: (text: string) => void,
    testID: string,
    placeholder: string,
    // A new reading or measurement opens with its first field ready for typing.
    autoFocus = false,
  ) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      autoFocus={autoFocus && !editing}
      testID={testID}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
    />
  );

  const save = async () => {
    const input = toInput(kind, form);
    const ok = await run(() =>
      params.id ? repo.updateEntry(params.id, input) : repo.addEntry(activeChild.id, input),
    );
    if (ok) router.back();
  };

  const remove = () =>
    Alert.alert('Delete entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (params.id && (await run(() => repo.deleteEntry(params.id as string)))) router.back();
        },
      },
    ]);

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{ title: `${editing ? 'Edit' : 'Add'} ${KIND_LABEL[kind].toLowerCase()}` }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {kind === 'feeding' && (
          <>
            <Field label="Type">
              <Segmented
                options={TYPE_OPTIONS}
                value={form.feedingType}
                onChange={(t) =>
                  set({
                    feedingType: t,
                    feedingMethod:
                      t === 'breast_milk'
                        ? form.feedingMethod === 'self'
                          ? 'left'
                          : form.feedingMethod
                        : form.feedingMethod === 'self'
                          ? 'self'
                          : 'bottle',
                  })
                }
              />
            </Field>
            <Field label="Method">
              <Segmented
                options={isBreast ? BREAST_METHODS : OTHER_METHODS}
                value={form.feedingMethod}
                onChange={(m) => set({ feedingMethod: m })}
              />
            </Field>
            {form.feedingMethod === 'bottle' && (
              <Field label="Amount (ml)">
                <TextInput
                  value={form.amount}
                  onChangeText={(amount) => set({ amount })}
                  testID="feed-amount"
                  keyboardType="numeric"
                  placeholder="e.g. 120"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
                />
              </Field>
            )}
          </>
        )}

        {kind === 'diaper' && (
          <>
            <ToggleRow
              label="Wet"
              value={form.wet}
              onChange={(wet) => set({ wet })}
              testID="toggle-wet"
            />
            <ToggleRow
              label="Solid"
              value={form.solid}
              onChange={(solid) => set({ solid })}
              testID="toggle-solid"
            />
            {form.solid && (
              <Field label="Colour">
                <Segmented
                  options={COLOR_OPTIONS}
                  value={form.color}
                  onChange={(color) => set({ color })}
                />
              </Field>
            )}
          </>
        )}

        {kind === 'pumping' && (
          <>
            <Field label="Side">
              <Segmented
                options={SIDE_OPTIONS}
                value={form.pumpingSide}
                onChange={(pumpingSide) => set({ pumpingSide })}
              />
            </Field>
            <Field label="Amount (ml)">
              {numberInput(form.amount, (amount) => set({ amount }), 'pump-amount', 'e.g. 90')}
            </Field>
          </>
        )}

        {kind === 'temperature' && (
          <>
            <Field label="Temperature (°C)">
              {numberInput(form.celsius, (celsius) => set({ celsius }), 'temperature-input', 'e.g. 37.2', true)}
            </Field>
            <Field label="Measured">
              <Segmented options={SITE_OPTIONS} value={form.site} onChange={(site) => set({ site })} />
            </Field>
          </>
        )}

        {kind === 'growth' && (
          <>
            <Field label="Weight (kg)">
              {numberInput(
                form.weight,
                (weight) => set({ weight }),
                'growth-weight',
                'e.g. 4.25',
                true,
              )}
            </Field>
            <Field label="Length (cm)">
              {numberInput(form.length, (length) => set({ length }), 'growth-length', 'e.g. 55')}
            </Field>
            <Field label="Head circumference (cm)">
              {numberInput(form.head, (head) => set({ head }), 'growth-head', 'e.g. 37.5')}
            </Field>
          </>
        )}

        <Field label={timed ? 'Start' : 'Time'}>
          <DateTimeField value={form.start} onChange={(start) => set({ start })} />
        </Field>

        {timed && (
          <>
            {editing && (
              <ToggleRow
                label="Still running"
                value={running}
                onChange={(on) => set({ end: on ? null : Math.max(Date.now(), form.start) })}
              />
            )}
            {!running && (
              <Field label="End">
                <DateTimeField value={form.end as number} onChange={(end) => set({ end })} />
              </Field>
            )}
          </>
        )}

        {kind === 'sleep' && (
          <ToggleRow label="Nap" value={form.nap} onChange={(nap) => set({ nap })} />
        )}

        <Field label="Notes">
          <TextInput
            value={form.notes}
            onChangeText={(notes) => set({ notes })}
            multiline
            placeholder="Optional"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.textInput,
              styles.notes,
              { color: theme.text, borderColor: theme.border },
            ]}
          />
        </Field>

        <Field label="Tags">
          <TagEditor
            tags={form.tags}
            draft={form.tagDraft}
            known={knownTags}
            onChange={({ tags, draft }) => set({ tags, tagDraft: draft })}
          />
        </Field>

        <View style={styles.actions}>
          <Button label="Save" variant="primary" onPress={save} />
          {editing && <Button label="Delete" variant="danger" onPress={remove} />}
        </View>
      </ScrollView>
    </ThemedView>
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
  textInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  notes: {
    minHeight: 88,
    paddingVertical: Spacing.two,
    textAlignVertical: 'top',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
