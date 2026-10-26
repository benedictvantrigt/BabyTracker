import * as SecureStore from 'expo-secure-store';

import type { SecretStore } from './engine';

/** Sync secrets in the Android Keystore / iOS Keychain; excluded from backups. */
export const secureStore: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
};
