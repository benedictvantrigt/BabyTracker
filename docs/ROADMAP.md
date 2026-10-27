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
| 2. Sync | QR pairing, encrypted change log, Cloudflare relay, data import | 🟡 0.2.0: pairing, encryption and relay done; data import and device removal open |
| 3. Notifications | Scheduled pushes through the relay, iOS Notification Service Extension, Android exact alarms, awake-window and feed rules | 🟡 0.3.0: done for Android; iOS part open |
| 4. Extras | NFC tags, Live Activities / Live Updates, widgets, charts, growth curves, PDF/CSV export | ⬜ Not started |
| 5. Hardening | Key recovery, backups, privacy statement, store submission | ⬜ Not started |

Current position: phases 1–3 are done for Android (version 0.3.0). Next up is phase 4.

To use sync and push on real phones, the relay must be deployed and push configured (README:
Cloudflare secrets, `RELAY_URL` variable, Firebase secrets).

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

Features to build later, grouped by phase. Tick them off here when done.

### Phase 2 — sync (remaining)
- [ ] Import existing data from another tracker (one-time)
- [ ] Remove another phone from the family, with family-key rotation
- [ ] Relay data retention: delete changes once every device has received them
- [ ] "Delete family": wipe the family's storage on the relay

### Phase 3 — notifications (remaining)
- [ ] iOS app build
- [ ] iOS Notification Service Extension to decrypt pushed reminders
- [ ] iOS night-feed alarm (time-sensitive notification, or AlarmKit on iOS 26+)

### Records not built yet
- [ ] Tummy time
- [ ] Pumping
- [ ] Temperature
- [ ] Growth: weight, height, head circumference
- [ ] Notes and tags on entries
- [ ] Multiple children in one family

### Phase 4 — extras
- [ ] NFC tags that open the app and log an entry (poo / pee / feed left / feed right / sleep toggle), via Android App Links / iOS Universal Links
- [ ] Live timer on the lock screen: iOS Live Activity, Android 16 Live Update (ongoing notification as fallback)
- [ ] Home-screen widgets
- [ ] Weekly charts
- [ ] Growth curves
- [ ] PDF / CSV export
- [ ] Daily reset at 20:00 (from the Home Assistant setup), as a local rule that syncs
- [ ] Roles per phone, e.g. a read-only babysitter phone (enforced by the relay)

### Phase 5 — hardening
- [ ] Recovery code (printable QR or word list) for when all phones are lost
- [ ] Key backup within a platform: Android Block Store / Restore Credentials, iOS iCloud Keychain
- [ ] Backups / data export for safekeeping
- [ ] Privacy statement
- [ ] Final package name (now the placeholder `com.babytracker.app`) and store submission (Google Play, App Store)
