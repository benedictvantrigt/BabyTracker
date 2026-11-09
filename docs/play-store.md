# Google Play release

What the first Play Store release needs, and the answers for the Play Console forms. The
build side is automated: a release from `main` attaches `babytracker-vX.Y.Z.aab` (signed
with the production key as upload key, target SDK checked ≥ 36) to the GitHub release.

## Steps

Done in the repository:
- AAB build and checks in CI (#47); `versionCode` goes up by one per release.
- Privacy statement (#25) at [docs/privacy.md](privacy.md), linked in Settings → About (#43).
- Health disclaimer in the sleep plan and Settings → About (#44).
- Live Update respects a dismissed timer notification (#51).

To do by hand, in this order:
1. **Name and package (#26, #50).** Pick the store name and the final package
   (`expo.android.package` in `mobile/app.json`, now `com.babytracker.app`). The package
   cannot change after the first upload. A new package also needs a new Android app in the
   production Firebase project and a new `GOOGLE_SERVICES_JSON_PROD`; phones on the old
   package keep working but don't update to the store app (reinstall and rejoin).
2. **Developer account (#48).** Personal account: needs the closed test below (at least 12
   testers, 14 days in a row) before production access. Organization account: no closed test,
   needs a D-U-N-S number.
3. **Create the app** in Play Console (default language, name, app, free). Enrol in
   **Play App Signing** (default) and keep our production key as the upload key.
4. **Upload the AAB** from the GitHub release to *Internal testing* first. The first bundle
   must be uploaded by hand in the console.
5. **App content** forms (answers below): privacy policy, app access, ads, content rating,
   target audience, data safety, health apps declaration, government apps (no), financial
   features (none).
6. **Store listing** (texts below), with screenshots from the E2E run
   (`e2e-results` branch) and a 512×512 icon and 1024×500 feature graphic.
7. **Closed testing** track with ≥ 12 testers for 14 days, then apply for production
   access (personal accounts).
8. **DSA trader status** (Play Console → account details, #45): trader if you earn
   money from the app (your address and phone then show on the listing), else non-trader.

## Store listing

**Name** (max 30 characters): see "Name" in the pull request / issue #50.

**Short description** (max 80):
> Log feeds, sleep and diapers. Private, offline, end-to-end encrypted sync.

**Full description:**
> Log your baby's feeds, sleep and diaper changes in a few taps, and see at a glance how long
> ago the last feed was and when the next nap is due.
>
> • Timers for breastfeeding (left/right) and sleep, also on the lock screen and in a
>   home-screen widget — or log a feed without a length
> • Age-based sleep schedule: planned naps and bedtime, today's sleep against the target
> • Reminders for naps and feeds, with an alarm for night feeds
> • Timeline with notes and tags; edit or delete any entry
> • Partner sync: pair two phones with a QR code. Everything is end-to-end encrypted, so the
>   sync server cannot read your entries
> • No account, no ads, no tracking. Works offline; your data stays on your phones
>
> The sleep schedule and reminders are general guidance, not medical advice.

**Category:** Parenting. **Contact email:** required by Play (shown on the listing).
**Privacy policy URL:** <https://github.com/benedictvantrigt/BabyTracker/blob/main/docs/privacy.md>

## App content answers

- **App access:** "All functionality is available without special access." Add a note:
  no account or login; partner sync needs two phones — on phone 1 Settings → Partner sync →
  Invite shows a QR code, phone 2 taps "Join your partner" and scans it (or pastes the code).
- **Ads:** no.
- **Target audience and content:** 18 and over only (parents). The app is not designed for
  children, so the Families policy does not apply.
- **Content rating (IARC questionnaire):** category "Utility, productivity, communication
  or other"; no violence, sexual content, profanity, drugs, gambling; users cannot
  communicate with strangers (sync is only between the family's own phones); no location
  sharing; no purchases.
- **Data safety** (based on [Google's definitions](https://support.google.com/googleplay/android-developer/answer/10787469):
  end-to-end encrypted data does not count as collected):
  - Does the app collect or share user data? **Yes** (collected, not shared).
  - **Device or other IDs: collected** — push token and the phone's public key (its device
    ID on the relay). Purpose: *App functionality*. Processed ephemerally: no. Required:
    no (only with partner sync, which is optional).
  - Feeds, sleep, diapers, notes and the baby's details: **not collected** (stay on the
    phone; synced only end-to-end encrypted).
  - Encrypted in transit: **yes** (HTTPS, plus end-to-end encryption).
  - Users can request deletion: **yes** — Settings → Partner sync → Delete family (or
    Remove for one phone). No account, so no account-deletion URL is needed.
  - Independent security review: no.
- **Health apps declaration** ([Google](https://support.google.com/googleplay/android-developer/answer/14738291)):
  pick the features that match (baby care / sleep tracking); the app is not a medical
  device and gives general guidance only.

## Sources

- Target API level: <https://developer.android.com/google/play/requirements/target-sdk>
- App Bundles and Play App Signing: <https://developer.android.com/guide/app-bundle>,
  <https://support.google.com/googleplay/android-developer/answer/9842756>
- Testing requirement for new personal accounts: <https://support.google.com/googleplay/android-developer/answer/14151465>
- Data safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- App access: <https://support.google.com/googleplay/android-developer/answer/15748846>
- DSA trader status: <https://support.google.com/googleplay/android-developer/answer/13628312>
- Expo, first submission by hand: <https://docs.expo.dev/submit/android/>
