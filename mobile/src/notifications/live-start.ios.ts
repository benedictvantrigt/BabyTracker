import { addPushToStartTokenListener } from 'expo-widgets';

let token: string | null = null;
const listeners = new Set<(token: string) => void>();
let subscribed = false;

/**
 * The push-to-start token for Live Activities (#98, iOS 17.2+): with it the relay starts a
 * partner's timer on this phone's lock screen. iOS hands it out once Live Activities are
 * allowed, and may change it.
 */
export function liveStartToken(): string | null {
  return token;
}

export function subscribeLiveStartToken(listener: (token: string) => void): () => void {
  listeners.add(listener);
  if (!subscribed) {
    subscribed = true;
    addPushToStartTokenListener((event) => {
      const next = event.activityPushToStartToken;
      if (!next || next === token) return;
      token = next;
      listeners.forEach((l) => l(next));
    });
  }
  return () => listeners.delete(listener);
}
