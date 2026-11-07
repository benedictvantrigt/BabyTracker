import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { TagChip } from '@/components/tags';
import { ThemedText } from '@/components/themed-text';
import { Button, Icon, KIND_ICON } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppData, useEntries, useNow } from '@/data/app-data';
import { entryDurationLabel, entryTitle, groupByDay, isTimedKind } from '@/domain/entries';
import { hasTag, tagsByUse } from '@/domain/tags';
import { DAY, formatClock, formatDayLabel, startOfLocalDay } from '@/domain/time';
import type { Entry } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

const PAGE_DAYS = 7;

export default function TimelineScreen() {
  const { activeChild } = useAppData();
  const now = useNow(30_000);
  const [days, setDays] = useState(PAGE_DAYS);
  const since = startOfLocalDay(now) - (days - 1) * DAY;
  const { entries, loaded } = useEntries(activeChild?.id, since);
  const [tag, setTag] = useState<string | null>(null);
  const tags = tagsByUse(entries);
  // A filter tag no longer in the list (its entries were edited) stops filtering.
  const filter =
    tag && tags.some((t) => t.toLocaleLowerCase() === tag.toLocaleLowerCase()) ? tag : null;
  const shown = filter ? entries.filter((e) => hasTag(e, filter)) : entries;

  const sections = groupByDay(shown).map((g) => ({
    title: formatDayLabel(g.dayStart, now),
    data: g.entries,
  }));

  return (
    <TabScreen>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="subtitle">Timeline</ThemedText>
            {tags.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tags}>
                {tags.map((t) => (
                  <TagChip
                    key={t}
                    label={t}
                    selected={t === filter}
                    accessibilityLabel={
                      t === filter ? `Show all entries` : `Show entries tagged ${t}`
                    }
                    testID={`filter-tag-${t}`}
                    onPress={() => setTag(t === filter ? null : t)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
            {section.title.toUpperCase()}
          </ThemedText>
        )}
        renderItem={({ item }) => <EntryRow entry={item} now={now} />}
        ListEmptyComponent={
          loaded ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {filter
                ? `Nothing tagged #${filter} in the last ${days} days.`
                : `Nothing logged in the last ${days} days.`}
            </ThemedText>
          ) : undefined
        }
        ListFooterComponent={
          activeChild ? (
            <Button
              label={`Show ${PAGE_DAYS} more days`}
              style={styles.more}
              onPress={() => setDays((d) => d + PAGE_DAYS)}
            />
          ) : undefined
        }
      />
    </TabScreen>
  );
}

function EntryRow({ entry, now }: { entry: Entry; now: number }) {
  const theme = useTheme();
  const color = theme[entry.kind];
  const running = entry.end === null;
  const time =
    isTimedKind(entry.kind) && entry.end !== null && entry.end !== entry.start
      ? `${formatClock(entry.start)} – ${formatClock(entry.end)}`
      : formatClock(entry.start);
  const duration = entryDurationLabel(entry, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${entryTitle(entry)} at ${formatClock(entry.start)}`}
      onPress={() =>
        router.push({ pathname: '/entry/[kind]', params: { kind: entry.kind, id: entry.id } })
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={KIND_ICON[entry.kind]} color={color} />
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1}>{entryTitle(entry)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {running ? `Running since ${formatClock(entry.start)}` : time}
          {entry.notes ? ` · ${entry.notes}` : ''}
          {entry.tags.length > 0 ? ` · ${entry.tags.map((t) => `#${t}`).join(' ')}` : ''}
        </ThemedText>
      </View>
      {duration && (
        <ThemedText type="smallBold" style={running ? { color } : undefined}>
          {duration}
        </ThemedText>
      )}
    </Pressable>
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
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.three,
  },
  tags: {
    gap: Spacing.two,
  },
  sectionHeader: {
    marginTop: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
  },
  empty: {
    marginTop: Spacing.four,
  },
  more: {
    marginTop: Spacing.three,
  },
});
