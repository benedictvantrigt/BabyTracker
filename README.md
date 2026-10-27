# Baby Tracker

A baby tracker without self-hosting: data lives on the phones, and partners
sync through a tiny relay that only ever sees encrypted data.

## Status: version 0.3.0 — phases 1–3 done (Android first)

## Phase 1 — local MVP

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
- Not yet: removing another phone from the family with key rotation, importing existing data.

## Phase 3 — notifications across phones

- **Reminders from the relay:** while sync is on, the phones hand the family's upcoming
  reminders (fire time + encrypted text) to the relay after every change. A Durable Object
  alarm pushes each one when due as a high-priority FCM message; the phone decrypts it and
  shows it (night feeds on the alarm channel). When either parent logs something, the set is
  replaced, so a stale reminder never fires. A set computed from an older log is ignored.
- **Partner updates in the background:** after a change the relay sends the other phones a
  data-only "sync" push; they sync in a headless task and update their running-timer
  notification. Normal priority, or high when a timer started or stopped (Android throttles
  high-priority pushes that show nothing).
- **Shared rules, per-phone choice:** awake window, feed interval, daytime hours and the
  reminder switches sync between phones; "Reminders on this phone" stays per phone.
- **Fallback:** without push (no Firebase config, or offline registration) each phone
  schedules reminders itself, as in phase 1.

### Enabling push

1. Create a Firebase project, add an Android app with package `com.babytracker.app`, and
   download `google-services.json`. Store its contents as repository secret
   `GOOGLE_SERVICES_JSON` (the APK build writes it into the app).
2. In Firebase → Project settings → Service accounts, generate a private key (JSON) and
   store it as repository secret `FIREBASE_SERVICE_ACCOUNT`; the "Deploy relay" workflow
   hands it to the relay as a Worker secret.

### Deploying the relay

1. Create a free Cloudflare account and an API token with the "Edit Cloudflare Workers" template.
2. In the GitHub repository settings add secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`, then run the "Deploy relay" workflow.
3. Add a repository variable `RELAY_URL` with the URL it prints
   (`https://babytracker-relay.<you>.workers.dev`); app builds then use it by default.

## Versions and branches

- `main` is the released line; work happens on short-lived branches merged into `main` by
  pull request. The relay deploys only from `main`.
- Versions follow [Semantic Versioning](https://semver.org/). `mobile/app.json` holds the
  version (`expo.version`) and the Android `versionCode`, which goes up by one per release so a
  new APK installs over the old one. `CHANGELOG.md` lists what each version changed.
- To release: raise both numbers, add the CHANGELOG entry and merge to `main`. When all tests
  pass on `main` and that version has no release yet, the workflow creates tag and GitHub
  release `v0.4.0` with the APK.
- `android-latest` stays a pre-release with the newest passing build of any branch, for testing.

## Layout

```
mobile/                Expo (React Native) app
  src/app/             screens (Expo Router)
  src/domain/          pure logic: types, summaries, reminder rules (unit tested)
  src/db/              SQLite schema, migrations and repository (tested against Node's SQLite)
  src/notifications/   Android channels, permissions, scheduling, refresh after changes
  src/background/      headless task for pushes from the relay (reminders, sync nudges)
  src/sync/            encryption, invite codes, relay client, sync engine, React provider
  e2e/                 emulator test runner, sync integration test, simulated partner phone
relay/                 Cloudflare Worker + Durable Object relay
```

## Run it

```bash
cd mobile
npm install
npm test            # unit tests
npm run test:sync   # simulated phones syncing through a local relay, push via a fake FCM
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
