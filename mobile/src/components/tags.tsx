import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MAX_TAGS, addTag, cleanTag, hasTag } from '@/domain/tags';
import { useTheme } from '@/hooks/use-theme';

/** A rounded tag; selected tags are filled with the tint colour. */
export function TagChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.tint : theme.backgroundSelected,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.onTint : theme.text }}>
        {selected ? `${label}  ✕` : `#${label}`}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Edits an entry's tags: the chosen tags (tap to remove), tags used before (tap to add)
 * and a field for a new one. The field's text is kept by the caller, so a tag typed but
 * not yet confirmed can still be saved (`addTag(tags, draft)`).
 */
export function TagEditor({
  tags,
  draft,
  known,
  onChange,
}: {
  tags: string[];
  draft: string;
  /** Tags used before, most used first. */
  known: string[];
  onChange: (next: { tags: string[]; draft: string }) => void;
}) {
  const theme = useTheme();
  const suggestions = known.filter((t) => !hasTag({ tags }, t)).slice(0, 12);
  const full = tags.length >= MAX_TAGS;
  const add = () => {
    if (cleanTag(draft)) onChange({ tags: addTag(tags, draft), draft: '' });
  };

  return (
    <View style={styles.editor}>
      {tags.length > 0 && (
        <View style={styles.wrap}>
          {tags.map((t) => (
            <TagChip
              key={t}
              label={t}
              selected
              accessibilityLabel={`Remove tag ${t}`}
              onPress={() => onChange({ tags: tags.filter((x) => x !== t), draft })}
            />
          ))}
        </View>
      )}
      {!full && (
        <TextInput
          value={draft}
          onChangeText={(text) => onChange({ tags, draft: text })}
          onSubmitEditing={add}
          onBlur={add}
          submitBehavior="submit"
          returnKeyType="done"
          autoCapitalize="none"
          placeholder="Add a tag, e.g. teething"
          placeholderTextColor={theme.textSecondary}
          testID="tag-input"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
      )}
      {!full && suggestions.length > 0 && (
        <View style={styles.wrap}>
          {suggestions.map((t) => (
            <TagChip
              key={t}
              label={t}
              selected={false}
              accessibilityLabel={`Add tag ${t}`}
              onPress={() => onChange({ tags: addTag(tags, t), draft })}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
    minHeight: 32,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
