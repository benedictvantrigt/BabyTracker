import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatClock } from '@/domain/time';
import { useSync } from '@/sync/app-sync';

export default function InviteScreen() {
  const sync = useSync();
  // Each request gets a number; results of an older request are ignored.
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{
    request: number;
    invite?: { code: string; expiresAt: number };
    error?: string;
  } | null>(null);

  useEffect(() => {
    sync.createInvite().then(
      (invite) => setResult({ request, invite }),
      (e: Error) => setResult({ request, error: e.message }),
    );
    // `sync` changes with every status update; only a new request should fetch a code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const current = result?.request === request ? result : null;
  const invite = current?.invite ?? null;
  const error = current?.error ?? null;
  const refresh = () => setRequest((n) => n + 1);

  return (
    <ThemedView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary">
          On your partner’s phone: install Baby Tracker, tap “Join your partner” and scan this code.
          It works once and expires after 15 minutes.
        </ThemedText>

        <Card style={styles.center}>
          {invite ? (
            <>
              <View style={styles.qr}>
                <QRCode value={invite.code} size={240} backgroundColor="#ffffff" color="#000000" />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Valid until {formatClock(invite.expiresAt)}
              </ThemedText>
            </>
          ) : error ? (
            <ThemedText>{error}</ThemedText>
          ) : (
            <ActivityIndicator />
          )}
        </Card>

        {invite && (
          <>
            <Button
              label="Share code instead"
              onPress={() => Share.share({ message: invite.code })}
            />
            <ThemedText type="small" themeColor="textSecondary">
              The code contains your family’s encryption key. Only send it to your partner, through
              an end-to-end encrypted chat.
            </ThemedText>
          </>
        )}
        <Button label="New code" onPress={refresh} />
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
  center: {
    alignItems: 'center',
    minHeight: 300,
    justifyContent: 'center',
  },
  qr: {
    padding: Spacing.three,
    backgroundColor: '#ffffff',
    borderRadius: Spacing.three,
  },
});
