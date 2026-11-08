# Changelog

All notable changes to Baby Tracker. Versions follow [Semantic Versioning](https://semver.org/);
before 1.0.0 a minor version marks a phase of the plan.

## Unreleased

- Live timers (#15): a running sleep or breastfeeding timer counts up outside the app without
  the app updating it. Android: ongoing notification with a chronometer, requested as a Live
  Update on Android 16+ (status bar chip, lock screen), from a small native module
  (`mobile/modules/timer-notification`). iPhone: a Live Activity on the lock screen and in the
  Dynamic Island (`expo-widgets`), falling back to a plain notification when switched off.
- Security (#40): release APKs are signed with our own keys instead of the public debug key
  of the Expo template, which let anyone build an APK that installs over the app. The
  production key is only available to release builds from `main` (GitHub environment
  `production`); CI refuses to release a production APK signed with the debug key. Phones
  with 0.6.0 or earlier must reinstall once and rejoin the family (README, "Signing keys").
- Screen readers: the Stop button of a running timer on the Today screen is now reachable
  on iOS (it sat inside the tappable card, which hid it from VoiceOver); timeline rows read
  out their notes and tags.
- iOS: the "iOS build" workflow runs on every push that changes the app and runs the Maestro
  flows on an iPhone Simulator, results on the `e2e-results-ios` branch.

## [0.6.0] — 2026-11-07 — Today screen, total sleep, tags and Android widget

- Today screen layout (#35): a turned-off card stays in its place, dimmed, and can still be
  moved; turning it back on restores it there. The separate "Hidden" list is gone. While the
  Sleep or Feeding card is off, its settings are hidden from the Settings tab (the Daytime
  settings when both are off); stored values and reminders stay as they were. Layouts saved
  by older versions are migrated.
- Sleep card (#30): "Sleep today 9h 40m of 16h" — the stage's day plus night sleep target
  against what was slept, without opening the plan. The day's total is the night that
  ended this morning plus today's naps, with a running sleep counted up to now; sleep
  starting after the latest nap end (17:00 with a 07:00 day start) counts toward the next
  day. The plan also shows the night against its target.
- Age under the baby's name (#29) includes the remaining days: "5 weeks 3 days",
  "4 months 12 days". Months count from the same day of the month (the last day in a
  shorter month).
- Home-screen widget on Android (#16): last feed, sleep and diaper as clock times ("Fed
  13:05 · next 17:05", "Awake since 10:00 · nap 12:00", "Diaper 10:15"), with buttons to
  start or stop sleep and log a wet or solid diaper without opening the app; "Feed" opens
  the feeding screen. A tap while the app is closed also updates reminders and syncs with
  the partner phone. The widget refreshes on every change, when a partner's change arrives
  by push, and every 30 minutes. Needs a new build (native module
  `react-native-android-widget`). iOS widgets follow later.
- Tags on entries (#12), next to the existing notes: add them on the entry screen (typed,
  or picked from tags used before, most used first), see them in the timeline, and filter
  the timeline by a tag. Tags sync with the partner phone; a phone on an older version
  drops the tags of an entry it edits, so update both phones.
- License: Functional Source License 1.1 with Apache 2.0 future license (`LICENSE.md`).
- iOS build started (#5): an EAS `simulator` profile and a manual "iOS build" workflow that
  builds the acceptance app for the iOS Simulator. On an iPhone, reminders are scheduled on
  the phone itself (its push token is an APNs token, which the FCM-only relay cannot use);
  night feeds are time-sensitive notifications (entitlement added).

## [0.5.1] — 2026-10-28 — Acceptance and production environments

- First release built for the production environment: the app connects to the production
  relay (`babytracker-relay`) and receives pushes from the production Firebase project
  without entering a sync server address.
- Two server environments: relay Workers `babytracker-relay-acc` (acceptance) and
  `babytracker-relay` (production), each with its own storage, secrets and Firebase project.
- The acceptance app "Baby Tracker (acc)" (`com.babytracker.app.acc`) installs next to the
  production app. `android-latest` and the E2E tests use it.
- The acceptance relay deploys on every push to `main`; releasing a version deploys the
  production relay and builds the release APK with the production settings.
- New repository secrets and variables: `GOOGLE_SERVICES_JSON_ACC` / `_PROD`,
  `FIREBASE_SERVICE_ACCOUNT_ACC` / `_PROD`, `RELAY_URL_ACC` / `_PROD`.

## [0.5.0] — unreleased — Phase 2 complete: family management

- Settings → Partner sync lists the family's phones by name (sealed on the relay), with
  when each last synced.
- Remove another phone: the remaining phones get a new family key, wrapped per phone
  (X25519 + HKDF on the device keys) so neither the relay nor the removed phone can open
  it. The relay drops everything sealed with the old key; the removing phone uploads a
  snapshot. A phone can no longer remove another without a new key.
- The relay deletes changes every phone has received; inviting a phone uploads a
  snapshot first, and nothing is deleted while an invite is open.
- Delete family: wipes the family from the relay; every phone keeps its own log. A
  removed phone, or one whose family was deleted, stops syncing and says so.
- Needs the relay redeployed, and every phone on 0.5.0 (an older app cannot sync once a
  phone has been removed).

## [0.4.0] — unreleased — Age-based sleep schedule

- The sleep timer follows a day schedule for the baby's age (14 stages from 0–3 weeks to
  3–4 years): planned naps (in-bed times), bedtime, awake windows and target day sleep,
  shifted with the day start. Stage from the birth date, or from the due date for a baby
  born early; can be set by hand.
- Sleep card: next nap or time left in the current nap, today's plan against what was
  slept, and advice when the day goes off plan (resettle after waking early, catch-up nap
  after a missed or short midday nap, wake-up when a nap runs over).
- Reminders before each planned nap and bedtime and at the planned end of a nap; the
  next morning's first nap after bedtime. Replace the awake-window reminder while the
  schedule is on; schedule settings are shared between partner phones.
- Due date for a baby born early (Settings → Baby).

## [0.3.0] — 2026-10-26 — Phase 3: notifications across phones

- Reminders handed to the relay (fire time + encrypted text) and pushed by FCM when due;
  night feeds on the alarm channel. A newer log replaces the set; stale sets are ignored.
- Data-only "sync" push to the other phones after a change; they sync in the background and
  update the running-timer notification.
- Reminder rules sync between phones; "Reminders on this phone" stays per phone.
- Falls back to on-phone scheduling without Firebase or push registration.

## 0.2.0 — 2026-10-26 — Phase 2: partner sync

- Pairing by single-use QR / invite code (15 minutes).
- End-to-end encryption (XChaCha20-Poly1305 family key, Ed25519 device signatures).
- Cloudflare Worker relay with one Durable Object per family; most recent edit wins.

## 0.1.0 — 2026-10-26 — Phase 1: local MVP (Android)

- Feeding, sleep and diaper logging with one-tap timers, Today screen and timeline.
- Customizable Today dashboard.
- On-phone reminders: nap, daytime feed, night feed alarm, ongoing timer notification.
- Android end-to-end tests on a GitHub Actions emulator; passing APK as `android-latest`.

[0.5.0]: https://github.com/benedictvantrigt/BabyTracker/releases/tag/v0.5.0
[0.4.0]: https://github.com/benedictvantrigt/BabyTracker/releases/tag/v0.4.0
[0.3.0]: https://github.com/benedictvantrigt/BabyTracker/releases/tag/v0.3.0
