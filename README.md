# Napchime

A baby tracker without self-hosting: data lives on the phones, and partners
sync through a tiny relay that only ever sees encrypted data.

## Status: version 0.5.1 — phases 1–3 done, age-based sleep schedule (Android first)

See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan and the feature backlog.

## Phase 1 — local MVP

- Feeding (breast left/right/both, bottle with ml, formula/solids), sleep (nap/night), diapers (wet/solid/colour)
- Tummy time (timer), pumping (side, ml), temperature (°C, where measured) and growth (weight, length, head circumference)
- One-tap timers: tap Left/Right to start a feed, switching sides stops the other side; Start/Stop sleep
- Today screen: running timers, time since last feed/diaper/sleep, next nap and feed, today's totals, undo
- Customizable Today screen: show, hide and reorder cards (e.g. diapers first in the newborn weeks, sleep later)
- Timeline grouped by day; tap any entry to edit or delete
- Age-based sleep schedule: planned naps and bedtime for the baby's age, time left in the
  current nap, today's plan against what was slept, and advice when the day goes off plan
- Reminders, scheduled on the phone from the log:
  - before each planned nap and bedtime, and when a nap should end (or, with the schedule
    off, when the awake window has passed)
  - feed reminder during the day (optional) and an alarm-style notification at night
  - a live timer while a sleep or breastfeeding timer runs, counting up on its own: an ongoing
    notification on Android (a Live Update in the status bar and on the lock screen from
    Android 16), a Live Activity on the iPhone lock screen and in the Dynamic Island

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
- **Family:** Settings → Partner sync lists the phones. Removing one gives the others a new
  family key, wrapped for each remaining phone with X25519 on its device key, so neither the
  relay nor the removed phone can open it; the old log is dropped and the remover uploads a
  snapshot. "Delete family" wipes the family from the relay; every phone keeps its own log.
- **A relay that lies (#41):** the phones do not take the relay's word for who is in the family.
  Each phone keeps a member list that travels in the encrypted log (a `member` change, which
  only holders of the family key can write): a joining phone announces itself and trusts the
  phone that invited it (its id is in the invite code). A new family key is only accepted when
  a trusted phone wrapped it, and "Remove" only wraps the new key for trusted phones; a phone
  only the relay lists shows as "Unknown phone" with a warning. Everything sealed is bound to
  its purpose as associated data (change + family + key epoch, reminder, device name, key
  wrap + epoch + recipient), so the relay cannot replay an old wrapped key or move ciphertext
  around. Partner sync shows a safety code of the trusted phones that both parents can
  compare. Families from before 0.7 trust the relay's list once, on the first sync after the
  update.
- **Retention:** the relay deletes changes every phone has received. Inviting a phone first
  uploads a snapshot, and nothing is deleted while an invite is open.

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

### Environments: acceptance and production

The server side exists twice, so changes can be tried on phones before they reach the real
family:

| | Acceptance | Production |
|---|---|---|
| Relay Worker | `babytracker-relay-acc` (`wrangler deploy --env acc`) | `babytracker-relay` (`wrangler deploy --env=""`) |
| Relay deploys | every push to `main` touching `relay/`; by hand from any branch | when a new version is released from `main`; by hand from `main` |
| Firebase project | one with Android app `com.napchime.app.acc` | one with Android app `com.napchime.app` |
| App | "Napchime (acc)", `com.napchime.app.acc` (`APP_VARIANT=acceptance`), installs next to production | "Napchime", `com.napchime.app` |
| APK | `android-latest` pre-release; the E2E tests run on this build | the versioned GitHub release |

Each relay has its own Durable Object storage and secrets, so the two never share data.

### Setting up the server side

1. **Cloudflare:** a free account, and an API token with *Account → Workers Scripts: Edit*
   and *Account → Account Settings: Read* on that account.
2. **Firebase:** two projects. In each, add the Android app with the package from the table,
   download its `google-services.json`, and under Project settings → Service accounts
   generate a private key (JSON).
3. **GitHub repository secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `GOOGLE_SERVICES_JSON_ACC` / `_PROD` (contents of `google-services.json`) and
   `FIREBASE_SERVICE_ACCOUNT_ACC` / `_PROD` (contents of the private key; the deploy hands it
   to the relay as Worker secret `FCM_SERVICE_ACCOUNT`).
4. Run the "Deploy relay" workflow for each environment (production from `main`) and add
   the URLs it prints as repository variables `RELAY_URL_ACC` and `RELAY_URL_PROD`
   (`https://babytracker-relay[-acc].<you>.workers.dev`); app builds use them by default.

Without the Cloudflare secrets the deploy is skipped; without a Firebase secret that relay
runs without push and the app schedules reminders on the phone itself.

### Signing keys

Release APKs are signed with our own keys (`mobile/plugins/with-release-signing.js`), not the
debug key in the Expo template, which is public: anyone holding it could build an APK that
installs as an update over the app and reads its data. Each app has its own key:

| | Acceptance (`com.napchime.app.acc`) | Production (`com.napchime.app`) |
|---|---|---|
| Where the secrets live | repository secrets | secrets of the GitHub environment `production`, deployment branches: `main` only |
| Secrets | `ANDROID_KEYSTORE_ACC_BASE64`, `ANDROID_KEYSTORE_ACC_PASSWORD`, `ANDROID_KEY_ACC_ALIAS` | `ANDROID_KEYSTORE_PROD_BASE64`, `ANDROID_KEYSTORE_PROD_PASSWORD`, `ANDROID_KEY_PROD_ALIAS` |
| Without them | the APK keeps the debug key, with a warning | the release fails |
| Optional pin (repository variable) | `ANDROID_CERT_SHA256_ACC` | `ANDROID_CERT_SHA256_PROD` |

The production key stays out of the repository secrets because every branch build can read
those. To create a key (keep the file and password offline as well; a lost key means no
more updates without reinstalling):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore babytracker-prod.keystore \
  -alias babytracker -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 babytracker-prod.keystore   # value of ANDROID_KEYSTORE_PROD_BASE64
keytool -list -v -keystore babytracker-prod.keystore | grep SHA256   # optional pin
```

With PKCS12 the key password is the keystore password. CI prints each APK's certificate
SHA-256 in the run summary and refuses to release a production APK signed with the debug key
or, when the pin is set, with any other key. Local release builds without
`ANDROID_KEYSTORE_PATH` keep the debug key.

Phones that installed an APK signed with the old debug key (0.6.0 and earlier) cannot update
to one with the new key: Android requires the same signature. Move them one at a time: sync,
uninstall, install the new APK, and join again from the other phone's invite; the log comes
back from that phone.

## Versions and branches

- `main` is the released line; work happens on short-lived branches merged into `main` by
  pull request. The acceptance relay deploys from `main` (or by hand from a branch); the
  production relay only from `main`.
- Versions follow [Semantic Versioning](https://semver.org/). `mobile/app.json` holds the
  version (`expo.version`) and the Android `versionCode`, which goes up by one per release so a
  new APK installs over the old one. `CHANGELOG.md` lists what each version changed.
- To release: raise both numbers, add the CHANGELOG entry and merge to `main`. When all tests
  pass on `main` and that version has no release yet, the workflow deploys the production
  relay, builds the production APK and creates tag and GitHub release `v0.4.0` with it.
- `android-latest` stays a pre-release with the newest passing acceptance build of any
  branch, for testing.

## About the sleep schedule

The age-based sleep schedule (`mobile/src/domain/sleep-schedule.ts`) is an example day
rhythm per age, put together by the developer from parenting guides. Every baby is
different. This is general guidance, not medical advice; ask your doctor or nurse if you
have concerns.

## Layout

```
mobile/                Expo (React Native) app
  src/app/             screens (Expo Router)
  src/domain/          pure logic: types, summaries, reminder rules (unit tested)
  src/db/              SQLite schema, migrations and repository (tested against Node's SQLite)
  src/notifications/   channels (Android), permissions, scheduling, refresh after changes
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

On an iPhone (work in progress, #5): the iPhone schedules its reminders itself, because pushes
from the relay only reach Android so far (#6). Night feeds use a time-sensitive notification,
which can break through a Focus when allowed in the iPhone settings. Running timers show as a
Live Activity (`expo-widgets`); if Live Activities are switched off for the app, as a plain
notification. A partner's timer appears when the app is opened, not by push (#6).

- **Simulator:** `npx eas-cli@latest build -p ios --profile simulator` (free Expo account), or
  the "iOS build" workflow (runs on every push that changes the app, or by hand from the
  Actions tab), which uploads the Simulator app as
  `babytracker-ios-simulator`. Neither needs an Apple account; installing needs a Mac with Xcode.
  The workflow also runs the Maestro flows on an iPhone Simulator (partner sync against a local
  relay included) and publishes the summary and screenshots to the `e2e-results-ios` branch;
  Android-only checks (alarms, ongoing notifications) are left out there.
- **iPhone:** `npx eas-cli@latest build -p ios --profile preview` needs the Apple Developer
  Program ($99/year) and the iPhone registered with `npx eas-cli@latest device:create`.

## Automated Android tests

Every push that touches `mobile/` runs `.github/workflows/android-e2e.yml`:

1. typecheck, lint and unit tests;
2. builds a release APK and runs the Maestro flows in `mobile/.maestro/` on an Android emulator;
3. checks that the app registered its reminder alarms and the ongoing timer notification;
   then joins a family created by a simulated partner phone and checks both directions sync;
4. pushes a summary, screenshots and logs to the `e2e-results` branch;
5. when everything passes, publishes the acceptance APK as the `android-latest` pre-release
   (open the release on the phone, download `babytracker.apk`, install).

## License

[Functional Source License 1.1, Apache 2.0 future license](LICENSE.md) (FSL-1.1-ALv2):
you may use, change and share the code for any purpose except a competing commercial
product or service. Each version becomes available under the Apache License 2.0 two years
after it is published. `mobile/LICENSE-expo-template` is the MIT license of the Expo
template the app started from.
