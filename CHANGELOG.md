# Changelog

All notable changes to Baby Tracker. Versions follow [Semantic Versioning](https://semver.org/);
before 1.0.0 a minor version marks a phase of the plan.

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

[0.3.0]: https://github.com/benedictvantrigt/BabyTracker/releases/tag/v0.3.0
