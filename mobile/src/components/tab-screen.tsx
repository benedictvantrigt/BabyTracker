import { type PropsWithChildren } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaView as TabSafeAreaView } from 'react-native-screens/experimental';

import { ThemedView } from '@/components/themed-view';

/**
 * Frame for a tab screen. On iOS the content ends at the top of the tab bar, so nothing
 * scrolls behind it (from iOS 26 the bar floats over the screen). The tab screen's own safe
 * area includes the bar; the root one used for the top edge does not.
 */
export function TabScreen({ children }: PropsWithChildren) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        {Platform.OS === 'ios' ? (
          <TabSafeAreaView edges={{ bottom: true }} style={styles.fill}>
            {children}
          </TabSafeAreaView>
        ) : (
          children
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
