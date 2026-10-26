import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AppDataProvider, useAppData } from '@/data/app-data';
import { migrate } from '@/db/schema';
import { NotificationSync } from '@/notifications/notification-sync';

SplashScreen.preventAutoHideAsync();

function HideSplashWhenLoaded() {
  const { loaded } = useAppData();
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName="babytracker.db" onInit={migrate}>
        <AppDataProvider>
          <HideSplashWhenLoaded />
          <NotificationSync />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="entry/[kind]" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen
              name="dashboard"
              options={{ presentation: 'modal', title: 'Customize Today' }}
            />
          </Stack>
        </AppDataProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
