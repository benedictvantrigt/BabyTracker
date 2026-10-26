# Baby Tracker

A baby tracker without self-hosting: data lives on the phones, and partners
sync through a tiny relay that only ever sees encrypted data.

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

## Phase 2 — partner sync

- **Pairing:** Settings → Partner sync → "Share with my partner" creates the family and shows a
  QR code; the partner taps "Join your partner" (also on the welcome screen) and scans it or pastes
  the code. Invites are single use and expire after 15 minutes.
- **Encryption:** every change is encrypted on the phone with XChaCha20-Poly1305 using a family
  key that only the phones have (it travels inside the QR code). Each phone signs its requests
  with its own Ed25519 key; the relay only accepts registered phones.
- **Sync:** each change is the full row; conflicting edits settle on the most recent one.
  Phones sync shortly after a change, when the app opens and every 30 s while it is open.
- **Relay:** `relay/`, a Cloudflare Worker with one Durable Object (SQLite) per family storing
  device keys, invite hashes and the encrypted change log. It fits the Workers free plan.
- Not yet: syncing settings (awake window etc. stay per phone), removing another phone from
  the family with key rotation, importing existing data.

### Deploying the relay

1. Create a free Cloudflare account and an API token with the "Edit Cloudflare Workers" template.
2. In the GitHub repository settings add secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`, then run the "Deploy relay" workflow.
3. Add a repository variable `RELAY_URL` with the URL it prints
   (`https://babytracker-relay.<you>.workers.dev`); app builds then use it by default.

## Layout

```
mobile/                Expo (React Native) app
  src/app/             screens (Expo Router)
  src/domain/          pure logic: types, summaries, reminder rules (unit tested)
  src/db/              SQLite schema, migrations and repository (tested against Node's SQLite)
  src/notifications/   Android channels, permissions, scheduling
  src/sync/            encryption, invite codes, relay client, sync engine, React provider
  e2e/                 emulator test runner, sync integration test, simulated partner phone
relay/                 Cloudflare Worker + Durable Object relay
```

## Run it

```bash
cd mobile
npm install
npm test            # unit tests
npm run test:sync   # two simulated phones syncing through a local relay
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
   then joins a family created by a simulated partner phone and checks both directions sync;
4. pushes a summary, screenshots and logs to the `e2e-results` branch;
5. when everything passes, publishes the APK as the `android-latest` pre-release
   (open the release on the phone, download `babytracker.apk`, install).
