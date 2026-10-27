# Changelog

All notable changes to Baby Tracker. Versions follow [Semantic Versioning](https://semver.org/);
before 1.0.0 a minor version marks a phase of the plan.

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
