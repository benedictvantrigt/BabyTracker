import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppData } from '@/data/app-data';
import { useTheme } from '@/hooks/use-theme';
import { useSync } from '@/sync/app-sync';

export default function JoinScreen() {
  const { children } = useAppData();
  const sync = useSync();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [joining, setJoining] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const join = async (value: string) => {
    if (joining) return;
    setJoining(true);
    setScanning(false);
    try {
      await sync.joinFamily(value);
      router.dismissTo('/');
    } catch (e) {
      Alert.alert('Could not join', e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  };

  const confirmAndJoin = (value: string) => {
    if (children.length === 0) {
      join(value);
      return;
    }
    Alert.alert(
      'Replace this phone’s log?',
      'Joining replaces everything logged on this phone with your family’s shared log.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Join', style: 'destructive', onPress: () => join(value) },
      ],
    );
  };

  const startScan = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (granted) setScanning(true);
  };

  return (
    <ThemedView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText themeColor="textSecondary">
          On your partner’s phone open Settings → Partner sync → Invite. Scan the QR code shown
          there, or paste the code they sent you.
        </ThemedText>

        {scanning ? (
          <Card>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (data.startsWith('BT1.')) confirmAndJoin(data);
              }}
            />
            <Button label="Cancel scanning" onPress={() => setScanning(false)} />
          </Card>
        ) : (
          <Button
            label="Scan QR code"
            variant="primary"
            icon={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner' }}
            onPress={startScan}
          />
        )}

        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            OR PASTE THE CODE
          </ThemedText>
          <TextInput
            value={code}
            onChangeText={setCode}
            testID="invite-code"
            placeholder="BT1.…"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          />
          <View>
            <Button
              label={joining ? 'Joining…' : 'Join'}
              variant="primary"
              disabled={!code.trim() || joining}
              onPress={() => confirmAndJoin(code)}
            />
          </View>
        </Card>
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
  camera: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    minHeight: 96,
    padding: Spacing.three,
    fontSize: 14,
    textAlignVertical: 'top',
  },
});
