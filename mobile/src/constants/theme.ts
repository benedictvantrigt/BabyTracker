/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    border: '#D9D9E0',
    tint: '#3E63DD',
    onTint: '#ffffff',
    danger: '#CE2C31',
    feeding: '#D6409F',
    sleep: '#6E56CF',
    diaper: '#AB6400',
    tummy: '#218358',
    pumping: '#0D74CE',
    temperature: '#CC4E00',
    growth: '#008573',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    border: '#363A3F',
    tint: '#849DFF',
    onTint: '#0B1023',
    danger: '#FF9592',
    feeding: '#F38CC4',
    sleep: '#B1A9FF',
    diaper: '#FFCA16',
    tummy: '#3DD68C',
    pumping: '#70B8FF',
    temperature: '#FF9E5E',
    growth: '#0BD8B6',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Space kept free above the tab bar. On iOS TabScreen already ends the screen above it.
export const BottomTabInset = Platform.select({ ios: 0, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
