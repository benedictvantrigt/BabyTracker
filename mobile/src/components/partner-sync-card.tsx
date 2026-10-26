import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatClock } from '@/domain/time';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_RELAY_URL, useSync } from '@/sync/app-sync';

export function PartnerSyncCard() {
  const sync = useSync();
  const { status } = sync;
  const theme = useTheme();
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<number | null>(null);

  useEffect(() => {
    if (!status.enabled || !status.lastSyncAt) return;
    sync.deviceCount().then(setDevices, () => {});
    // Refresh the phone count after each successful sync only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.enabled, status.lastSyncAt]);

  const start = async () => {
    setBusy(true);
    try {
      await sync.createFamily(relayUrl.trim());
      router.push('/sync/invite');
    } catch (e) {
      Alert.alert('Could not start sharing', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    Alert.alert(
      'Stop syncing on this phone?',
      'This phone keeps what is logged so far but no longer receives your partner’s updates.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop syncing', style: 'destructive', onPress: () => sync.leaveFamily() },
      ],
    );

  if (!status.enabled) {
    return (
      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          PARTNER SYNC
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Log on both phones and see the same timeline. Everything is end-to-end encrypted: the sync
          server only stores data it cannot read.
        </ThemedText>
        {!DEFAULT_RELAY_URL && (
          <Field label="Sync server">
            <TextInput
              value={relayUrl}
              onChangeText={setRelayUrl}
              testID="relay-url"
              placeholder="https://…"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
          </Field>
        )}
        <Button
          label={busy ? 'Starting…' : 'Share with my partner'}
          variant="primary"
          disabled={busy || !/^https?:\/\/.+/.test(relayUrl.trim())}
          onPress={start}
        />
        <Button label="Join my partner" onPress={() => router.push('/sync/join')} />
      </Card>
    );
  }

  const state = status.syncing
    ? 'Syncing…'
    : status.error
      ? status.error
      : status.lastSyncAt
        ? `Synced at ${formatClock(status.lastSyncAt)}`
        : 'Not synced yet';

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        PARTNER SYNC
      </ThemedText>
      <ThemedText testID="sync-status" style={status.error ? { color: theme.danger } : undefined}>
        {state}
      </ThemedText>
      {devices !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {devices === 1 ? 'Only this phone so far' : `${devices} phones share this log`}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary" testID="reminder-delivery">
        {status.push
          ? 'Reminders arrive by push from the sync server, so they follow your partner’s logging even while this app is closed.'
          : 'Reminders are scheduled on this phone. Push is not available in this build, so they update when the app syncs.'}
      </ThemedText>
      <Button
        label="Invite partner"
        variant="primary"
        icon={{ ios: 'qrcode', android: 'qr_code' }}
        onPress={() => router.push('/sync/invite')}
      />
      <Button label="Sync now" disabled={status.syncing} onPress={() => sync.syncNow()} />
      <Button label="Stop syncing on this phone" variant="danger" onPress={leave} />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
