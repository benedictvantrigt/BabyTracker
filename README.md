# Baby Tracker

A baby tracker that needs no server: data lives on the phone. Partner sync
through a small end-to-end encrypted relay is planned for a later phase.

## Status: Phase 1 — local MVP (Android first)

- Feeding (breast left/right/both, bottle with ml, formula/solids), sleep (nap/night), diapers (wet/solid/colour)
- One-tap timers: tap Left/Right to start a feed, switching sides stops the other side; Start/Stop sleep
- Today screen: running timers, time since last feed/diaper/sleep, next nap and feed, today's totals, undo
- Customizable Today screen: show, hide and reorder cards (e.g. diapers first in the newborn weeks, sleep later)
- Timeline grouped by day; tap any entry to edit or delete
- Reminders, scheduled on the phone from the log:
  - nap reminder when the awake window has passed (daytime only)
  - feed reminder during the day (optional) and an alarm-style notification at night
  - ongoing notification while a timer runs

## Layout

```
mobile/                Expo (React Native) app
  src/app/             screens (Expo Router)
  src/domain/          pure logic: types, summaries, reminder rules (unit tested)
  src/db/              SQLite schema, migrations and repository (tested against Node's SQLite)
  src/notifications/   Android channels, permissions, scheduling
```

## Run it

```bash
cd mobile
npm install
npm test            # unit tests
npm run typecheck
npm run lint
```

On a phone:

- **Quick look:** `npx expo start`, then scan the QR code with Expo Go. Exact-alarm permission
  is not available inside Expo Go.
- **Installable APK:** `npx eas-cli@latest build -p android --profile preview` (free Expo account),
  or `npx expo run:android` with Android Studio installed.

## Automated Android tests

Every push that touches `mobile/` runs `.github/workflows/android-e2e.yml`:

1. typecheck, lint and unit tests;
2. builds a release APK and runs the Maestro flows in `mobile/.maestro/` on an Android emulator;
3. checks that the app registered its reminder alarms and the ongoing timer notification;
4. pushes a summary, screenshots and logs to the `e2e-results` branch;
5. when everything passes, publishes the APK as the `android-latest` pre-release
   (open the release on the phone, download `babytracker.apk`, install).
