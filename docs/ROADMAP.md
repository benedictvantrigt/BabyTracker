# Roadmap

The plan for Baby Tracker and where it stands. Update this file when a phase or feature is
finished; `CHANGELOG.md` records what each released version contains.

## Goal

A baby tracker without self-hosting. Each phone keeps the full database (SQLite)
and works offline. The only central part is a small relay (Cloudflare Worker, one Durable
Object per family) that:

1. passes end-to-end encrypted changes between the parents' phones, and
2. sends scheduled push notifications whose content it cannot read.

The relay only sees a random family ID, ciphertext, timestamps, device public keys and push
tokens. There are no accounts: identity is a family key shared by QR code plus one signing key
per phone. The app is React Native (Expo), Android first, iOS later.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1. Local MVP | Data model; feeding, sleep and diaper entry; timers; "time since last" dashboard; local reminders | ✅ Done in 0.1.0 (plus customizable Today screen, emulator E2E tests) |
| 2. Sync | QR pairing, encrypted change log, Cloudflare relay, device removal, retention | ✅ 0.2.0 pairing, encryption and relay; 0.5.0 device removal with key rotation, retention, delete family; data import dropped |
| 3. Notifications | Scheduled pushes through the relay, iOS Notification Service Extension, Android exact alarms, awake-window and feed rules | 🟡 0.3.0: done for Android; iOS started (#5: build config, local reminders) |
| 4. Extras | Record types still missing (tummy time, pumping, growth, …), NFC tags, Live Activities / Live Updates, widgets, charts, growth curves, PDF/CSV export | ⬜ Not started |
| 5. Hardening | Key recovery, backups, privacy statement, store submission | ⬜ Not started |

Current position: phases 1–3 are done for Android (Phase 2 completed in 0.5.0). Phase 4 has
started with the age-based sleep schedule (#28, version 0.4.0).

The server side runs in two environments, acceptance and production, each with its own
relay Worker, Firebase project and app package (README: "Environments: acceptance and
production" and "Setting up the server side").

## Design decisions to keep

- **Records** are add-only events with an ID, timestamps and a soft-delete marker. Sync sends
  the full row; the most recent edit wins (no CRDT library).
- **Reminders** are computed on the phone that logs an event and handed to the relay as
  fire time + encrypted text; a newer set replaces the old one. Each phone also schedules
  locally as a fallback when push is unavailable.
- **Android exact alarms:** ask for `SCHEDULE_EXACT_ALARM`; `USE_EXACT_ALARM` is reserved by
  Play policy for alarm-clock and calendar apps.
- **iOS** (later): a Notification Service Extension decrypts pushed reminders before they show.
  Live Activity updates by push cannot be end-to-end encrypted, so they carry only a timestamp
  and a generic label — the one deliberate exception to "the server knows nothing".
- **Native app, not a PWA:** iOS web push needs home-screen install and offers no Live
  Activities, NFC launch or exact alarms.
- **Costs:** the relay fits the Cloudflare Workers free plan; APNs and FCM are free. Store
  fees: Apple Developer Program $99/year, Google Play $25 once.

## Backlog

Features to build later are GitHub issues, grouped in one milestone per phase:
[all milestones](https://github.com/benedictvantrigt/BabyTracker/milestones), [open issues](https://github.com/benedictvantrigt/BabyTracker/issues).
Close an issue with "Closes #N" in the commit or pull request that finishes it, and update the
phase table above when a milestone is done. Problems found while testing are issues labelled
[`bug`](https://github.com/benedictvantrigt/BabyTracker/labels/bug), without a milestone.

### Phase 2: Sync — [milestone](https://github.com/benedictvantrigt/BabyTracker/milestone/1) (done in 0.5.0)

- ~~#1 Import existing data from another tracker~~ (not planned)
- #2 Remove another phone from the family, with key rotation (0.5.0)
- #3 Relay data retention: delete changes all devices have received (0.5.0)
- #4 Delete family (0.5.0)

### Phase 3: Notifications (remaining) — [milestone](https://github.com/benedictvantrigt/BabyTracker/milestone/2)

- #5 iOS app build (in progress: Simulator profile and build workflow, iPhone schedules its own reminders; not yet tested on a device)
- #6 iOS Notification Service Extension to decrypt pushed reminders
- #7 iOS night-feed alarm

### Phase 4: Extras — [milestone](https://github.com/benedictvantrigt/BabyTracker/milestone/4)

Records:
- #8 Tummy time
- #9 Pumping
- #10 Temperature
- #11 Growth measurements: weight, height, head circumference
- #12 Notes and tags on entries
- #13 Multiple children in one family

Other extras:
- #14 NFC tags that log an entry
- #15 Live timer on the lock screen
- #16 Home-screen widgets
- #17 Weekly charts
- #18 Growth curves
- #19 PDF / CSV export
- #20 Daily reset at 20:00
- #21 Roles per phone (read-only babysitter)
- #28 Age-based sleep schedule in the sleep timer (0.4.0)
- #29 Show days in the age under the baby's name
- #30 Show total sleep needed per the schedule and total slept that day
- #35 Today screen layout: keep turned-off cards in place, and hide their settings

### Phase 5: Hardening — [milestone](https://github.com/benedictvantrigt/BabyTracker/milestone/5)

- #22 Recovery code
- #23 Key backup within a platform
- #24 Backups / data export for safekeeping
- #25 Privacy statement
- #26 Final package name and store submission
