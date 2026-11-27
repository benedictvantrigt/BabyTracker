/**
 * The push-to-start token for Live Activities (#98): with it the relay starts a partner's timer
 * on this phone's lock screen. iPhone only (`live-start.ios.ts`); null elsewhere.
 */
export function liveStartToken(): string | null {
  return null;
}

export function subscribeLiveStartToken(_listener: (token: string) => void): () => void {
  return () => {};
}
