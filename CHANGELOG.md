# Changelog

All notable changes to Napchime. Versions follow [Semantic Versioning](https://semver.org/);
before 1.0.0 a minor version marks a phase of the plan.

## [0.14.0] — 2026-11-27 — Settings grouped by what is shared

- Settings, reordered (#103): Day, Sleep and Feeding hold what partner sync shares, and say
  so; a new **This phone** card holds what each phone chooses for itself: My days, Time
  feeds, the lock-screen sleep and awake timers, and Ring like an alarm clock.
- Sleep: plan naps by *Age schedule* or *Awake window*, one choice instead of a switch that
  swapped the controls below it. "Remind before nap" shows under Nap reminders.
- "Track night sleep" is now "Record night sleep" and is shared with the partner phones: it
  decides what either phone can record, so the phones no longer disagree.
- "Nap reminders on this phone" and "Feed reminders on this phone" are gone: My days decides
  when a phone reminds. A phone that had both off is taken off duty on every day, so it stays
  silent. A single one left off keeps working and shows until it is turned back on.

## [0.13.0] — 2026-11-27 — Live Activities on iPhone, buttons on the lock-screen timer, reflux timer

- iPhone: running timers show as a Live Activity on the lock screen and in the Dynamic Island.
  They never did: the app bundler picked the shared `live-timers.ts`, which has no Live
  Activities, over the iPhone version `live-timers.ios.tsx`, because it tries every platform
  for `.ts` files before any `.tsx` file. So the timer showed as a notification, with no error
  and nothing in Settings. The shared file is now `.tsx`, and a test fails when a platform file
  is hidden this way (#49).
- Lock-screen timer buttons (#97): the sleep timer has Wake, the awake timer Sleep, a feeding
  timer Stop. The tap runs without opening the app, does only what the button says (a partner
  may have changed the sleep meanwhile) and ignores a double tap; then the timers, the widgets
  and the partner phones catch up. Android: a button on the Live Update / timer notification.
  iPhone: a button in the Live Activity.
- iPhone: a timer a partner starts shows on the lock screen straight away (#98), also when
  Napchime is closed (push-to-start, iOS 17.2+). iOS draws it before the app runs, so it
  cannot be end-to-end encrypted: it says only "Asleep" or "Feeding" and the start time, never
  the baby's name. Napchime replaces it with the full timer once it runs.
- Reflux timer (#93): Settings, Feeding, "Reflux timer" with how long to keep the baby upright
  (5–90 minutes, 30 by default), shared with the partner phones. It runs from the end of each
  milk feed (not solids; while a feed still runs, as when switching sides, it waits) and shows
  on the Today Feeding card, as a countdown on the lock screen, and as a notification when the
  time is over. Off by default.

## [0.12.5] — 2026-11-27 — The lock-screen timer no longer waits forever

- iPhone: updating the lock-screen timer and reminders could hang without an error, so no
  Live Activity appeared and an old timer notification stayed (0.12.4 showed "not updated").
  Every step that waits for iOS now has a time limit: a Live Activity iOS no longer answers
  for is replaced, and the night-feed alarms (AlarmKit) are set after the timers instead of
  before them, so asking for alarm permission no longer holds the timers up (#49).
- iPhone Settings, About: the lock-screen timer line also says which step is busy, so a step
  that still hangs shows by name.

## [0.12.4] — 2026-11-26 — Why the iPhone timer is not a Live Activity

- iPhone Settings: the card with iOS's reason for refusing the Live Activity now shows. It
  looked for the reason only when the screen drew, and the app asks iOS again as it comes to
  the front, so the reason came in after the card had drawn (#49).
- iPhone Settings, About: a line says what the last lock-screen timer update did: how many
  timers, how many Live Activities iOS shows, or why the update failed. For finding out why the
  timer shows only as a notification; it goes once Live Activities work (#49).
- A failing night-feed alarm (AlarmKit) no longer keeps the lock-screen timers and the other
  reminders from updating.

## [0.12.3] — 2026-11-26 — Widgets keep up, sync shows at once

- Widgets switch at midnight, the day start and the day end without the app being opened: they
  kept showing the night in the morning. Android sets an alarm that redraws the widget (also
  in Doze) and then removes a forgotten sleep timer; the iPhone widget gets its pictures for
  those moments in advance.
- iPhone widget, "Edit Widget": the button settings are called "Small widget: first / second
  button", and the description says Feeding, Sleep, Diaper and Latest entries are for the
  medium and large widget. Those switches did nothing on the small widget without saying so.
- Sync: what a partner logged now shows on an open app without restarting it. A push from
  the sync server pulled the change in the background through a database connection of its
  own, so the screens were not told, and "Sync now" found nothing left to pull. The push now
  goes through the app's own connection; returning to the app and "Sync now" also read again.
- Android widget: a tap is no longer thrown away now and then. The widget library dropped a
  tap whenever the size it measured from the tap differed from the size the widget was drawn
  at (launcher animations, a restart, a home-screen change) and only redrew the widget; it now
  carries the tap out as well (`scripts/patch-android-widget.js`).
- iPhone: when iOS refuses the Live Activity for a running timer (it then shows as a
  notification), Settings says so with iOS's reason and a button to the iPhone settings (#49).

## [0.12.2] — 2026-11-25 — Small and large iPhone widget, forgotten sleep

- Day sleep only ("Track night sleep" off): a sleep started during the day and still running
  at the day end is removed, as if it was never logged. The lock-screen timer and the widgets
  drop it at the day end even if the app does not run then.
- iPhone widget, small: one or two wide buttons with an icon, chosen in "Edit Widget" (Sleep /
  Wake, Wet, Solid or Wet + solid), under a line that counts how long the baby is awake or
  asleep. Feed is no longer in the small size.
- iPhone widget, large: today's totals, what comes next (nap or bedtime, feed) and the latest
  four entries under the rows, so the space is used.
- iOS tests: a flow that lost the Simulator is run once more also when Maestro reports only
  "Unknown error".

## [0.12.1] — 2026-11-24 — iPhone widget shows its data

- iPhone home-screen widget (#16): it stayed white. Empty values in what the app gives the
  widget made iOS drop the whole timeline without a word; the app now leaves them out. Until
  the app has run once, the widget asks to open Napchime instead of staying blank.
- iPhone: Customize Today, the entry forms and the partner screens start below their
  see-through header instead of under the title (#94).

## [0.12.0] — 2026-11-22 — iPhone home-screen widget

- iPhone home-screen widget (#16): feed, sleep and diaper with the latest entries and live
  timers, in small, medium and large; "Edit Widget" chooses the rows and buttons-only. Sleep /
  Wake, Wet and Solid work with the app closed: the tap wakes the app in the background to
  save the entry, update the lock-screen timer and sync to the partner. Feed opens the
  feeding screen.

## [0.11.4] — 2026-11-22 — Live timers follow widget taps and partner changes

- Android widget: Sleep / Wake with the app open in the background now updates the
  lock-screen timer and syncs to the partner right away, instead of when the app was next
  opened (the app's follow-ups ran on timers that Android pauses in the background).
- iPhone pushes are on (#6): the relays have an APNs key and the App Store build includes
  the notification service extension, so the iPhone gets reminders and "partner changed
  something" pushes from the relay like Android does.
- iPhone: the app may now run briefly for a silent push (background mode
  `remote-notification`), so a partner's start or stop also updates the lock-screen timer
  without opening the app. A new timer can't be started from the background on iOS: an
  existing one (such as the awake timer) changes over instead.

## [0.11.3] — 2026-11-21 — iPhone date wheel, no Nap switch, relay guard

- iPhone: date and time fields open a wheel below the field instead of the pop-up picker,
  which did not take a new start time when adding or editing a sleep.
- Sleep: the Nap switch is gone. Whether a sleep is a nap or the night follows from when it
  starts and the day hours in Settings.
- Relay: a phone's label is stored with a real registration change only, and the same
  registration repeated within 3 seconds is turned away before it reaches the family's
  storage. Phones still on 0.11.1 or older, which re-register in a loop, then cost almost
  nothing.

## [0.11.2] — 2026-11-20 — Push registration loop, QR join and totals

- Fix: on iPhone, registering for pushes fired the push-token listener, which registered
  again, in a loop: hundreds of requests a second to the relay while the app was open,
  which used up the relay's daily write quota. A registration now goes out once per change.
- Relay: writes only what changed. "Last synced" is stored at most every 5 minutes, the
  sync position only when it moves, and a repeated push registration writes nothing.
- Fix: joining by QR code showed "This invite has expired" although the phone did join:
  the camera reported the code several times and the second join found the invite used.
- Today's totals leave out feeds, diapers or sleep when that card is turned off on the
  Today screen (the log keeps them). With all three off the totals card hides.
- The welcome screen no longer says sharing comes in a later version.

## [0.11.1] — 2026-11-20 — Reminders per item, sleep timer end and quicker widget

- Settings: nap and feed reminders now switch on or off per phone apart, under Sleep and
  Feeding. The sleep timer and the awake timer on the lock screen each have a switch under
  Sleep. The card that held them is now "On duty", with only the days of the week. A phone
  that had all reminders off keeps both kinds off.
- Reminders by push: each phone tells the relay which reminders it wants (kinds and days on
  duty, with its time zone), and the relay sends only those. An iPhone shows a pushed alert
  without asking the app, so it could not leave them out itself. The privacy policy says so.
- Sleep timer on the lock screen: it now says until when the baby should sleep, like the
  Today screen: a nap until its planned end (with the age schedule), a night until the day
  starts ("Nap until 14:30", "Night until 07:00").
- Home-screen widget: a tap shows its result right away instead of after the sync with the
  partner phones, a tapped diaper button shows a check mark, and a quick second tap on the
  same button is ignored, so a double tap no longer logs two diapers or stops a fresh sleep.
- iOS builds use Xcode 27 and the iOS 27 SDK, which App Store Connect requires from April 2027
  (ITMS-90725).

## [0.11.0] — 2026-11-19 — Night alarm, end-time timeline and relay retention

- Timeline (#70): entries with a length sit at their end time, so a night shows above what
  happened while the baby slept, under the day it ended. Running timers stay on top.
- Settings (#64): the Daytime card (day start and end) now comes right before the Sleep card
  whose schedule it drives.
- iPhone night alarm (#7): on iOS 26 and later the night feed reminder rings like an alarm
  clock (AlarmKit), also in silent mode and Focus. iOS asks once, the first time a night feed
  is planned while the app is open. Turn it off per phone in Settings → Feeding → "Ring like an
  alarm clock". Without permission or on older iOS the time-sensitive notification stays.
- Android timer notification (#51): a timer you swipe away stays away until it stops. If Live
  Updates are turned off for Napchime (Android 16+), Settings shows a link to turn them on.
- Relay retention (#59): a family none of whose phones synced for 12 months is deleted from the
  sync server; a phone silent for 90 days loses its push token until it syncs again. The
  Partner sync card and the privacy policy say so.
- iPhone reminders by push (#6): the relay can push to iPhones through APNs and a notification
  service extension decrypts the reminder before it shows. Off until the APNs key and the
  extension's profile are set up (README, App Store); until then the iPhone schedules its
  reminders itself, as before.
- Sleep card (#81): the day plan no longer says "too short". A too-short nap shows slept
  against planned like any finished nap ("30m of 2h 00m"), and the note explaining
  "too short" is gone. The catch-up advice stays.
- Day sleep only (#80): Settings → Sleep → "Track night sleep" (per phone, not synced; on by
  default). When off, this phone tracks naps only: outside the day hours the Sleep card shows
  "Night · not tracked on this phone" without a Start sleep button, the widget's sleep button
  starts no timer, and the phone shows no lock-screen timer for a night sleep, also one logged
  on a partner's phone. In the morning the awake time and the awake timer count from the day
  start (or a later logged wake-up), and without the schedule the first nap reminder is one
  awake window after the day start. The bedtime reminder stays. The Sleep card shows day sleep
  against the day target instead of night and total sleep. Night entries already logged stay.

## [0.10.0] — 2026-11-19 — My days, awake timer and feeds without a length

- Awake timer (#73): between sleeps, the lock screen shows how long the baby has been awake,
  counting down to the next nap: the next planned nap or bedtime with the sleep schedule on,
  else the awake window. It keeps counting once the nap is overdue, shows only during the day
  hours (a wake-up up to an hour before the day start counts as the morning) and makes way for
  the sleep timer when a sleep starts. Android: ongoing notification or Live Update, removed at
  the end of the day; iOS: Live Activity. Both phones show it; turn it off per phone in
  Settings → This phone.
- Privacy policy: the publisher is named without a street address; contact stays by email.
- Feeding (#53): log a feed without a length. The feeding form has a "Length" switch; off
  logs the feed at one moment. Settings → Feeding → "Time feeds" (per phone): when off, Left
  and Right on the Today card log the feed now instead of starting a timer. Feeds without a
  length show no duration in the timeline.
- Sleep card (#54): the day plan shows slept against planned per nap ("30m of 2h 00m · too
  short"), with a note that "too short" means less than half of the planned nap. The catch-up
  advice now says the midday nap was missed or too short.
- Sleep card (#55): "Sleep today … of …" is the last line of the card.
- My days (#71): Settings → This phone has a row of day chips (Mo–Su) for the days this phone
  is on duty. On those days it shows every reminder, the running-timer notification and the
  awake timer; on the other days none of them, so partners can split the days. A day runs from day start to the
  next day start, so a night feed counts toward the evening before. Saved per phone, not
  synced; all days are on by default. A running timer's notification appears or goes at the
  next refresh after the day changes (opening the app, a new entry or a partner's change).

## [0.9.0] — 2026-11-18 — App icon, widget settings and store preparation

- Android asks for fewer permissions. Removed: drawing over other apps, storage, fingerprint
  and biometrics, Play licence check, install referrer and launcher badge counters, which
  libraries and Expo's template added but Napchime doesn't use. CI now fails when an APK asks
  for a permission that isn't on the list in `.github/scripts/verify-apk-permissions.sh`.
- New app icon: a white moon with a gold bell on lilac (#B4A5F2), replacing the Expo template
  icon. The splash screen and the Android adaptive icon background are lilac too. The source is
  `mobile/assets/images/napchime-mark.svg`; the Play Store icon and feature graphic are in
  `docs/store/`.
- The baby's age under the name shows the whole weeks in brackets when it isn't already in
  weeks: "10 days (1 week)", "4 months 12 days (19 weeks)".
- Android widget: each widget on the home screen has its own settings. When you add it, and
  later from its long-press menu ("Reconfigure", Android 12 and later), choose the rows
  (feeding, sleep, diaper) and whether it shows the latest entries or buttons only. It can now
  be made as small as 1×1: smaller sizes drop the latest entries, then rows, down to one
  button for the first chosen row. The settings stay on the phone and are not synced.

## [0.8.0] — 2026-11-18 — Napchime, more records and Google Play

- Google Play: every release also builds an Android App Bundle (`napchime-vX.Y.Z.aab`), signed
  with the production key as Play upload key, and can upload it to a Play track by itself
  (repository variable `PLAY_TRACK`) through Workload Identity Federation, without a stored
  key (README, Google Play). The app links to its privacy policy.
- The app is now called Napchime: package and bundle ID `com.napchime.app` (acceptance
  `com.napchime.app.acc`), link scheme `napchime://`. This is a new app for Android and iOS, so
  phones with Baby Tracker installed need to install Napchime and rejoin the family. The
  relay, the database file and the encryption are unchanged.
- Android: a running sleep or feeding timer now has an icon in the status bar. Its
  notification moved to a new "Running timers" channel at normal importance, still without
  sound or vibration; the old low-importance channel filed it under "Silent", which has no
  status bar icon before Android 16.
- Switches no longer flicker when tapped (Customize Today, Settings): they showed the old
  position again until the setting was saved and reloaded, then flipped. They now keep the
  new position, and only go back when saving fails.
- Sleep schedule: nap times no longer include the guide's optional extra sleep. Where the
  guide gives two times ("15.30/15.45 - 17.00"), the shorter nap is used: later start,
  earlier end. Changes for 3–6 weeks to 12–16 weeks, 5 and 6 months, and 2–3 years.
  Likewise the later bedtime: 18:30 at 9–12 weeks, 19:00 at 12–16 weeks.
- Sleep card: "Today's plan" shows the guide's day and night sleep for the baby's age
  under the times.
- Sleep totals: a sleep after the latest nap time (17:00 by default) now counts as day
  sleep when it started before bedtime and ended by half an hour after it. Before, it was
  left out of today's day sleep and total (or cut off at 17:00), and counted as part of
  the next night. A sleep that runs on is still the night.
- New records (#8, #9, #10, #11): tummy time (a timer), pumping (side and amount),
  temperature (°C and where it was measured) and growth (weight, length and head
  circumference). They are in the timeline, sync to the partner phone and take notes and
  tags. A new Today card, "More records", starts and stops tummy time, opens the other
  forms and shows today's tummy time, pumped milk and the latest temperature and growth.
  It can be turned off or moved like the other cards. Phones on 0.7.0 skip these records:
  update both phones. A new temperature or growth entry opens with the keyboard ready.

## [0.7.0] — 2026-11-08 — Live timers and security fixes

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
- Security (#41): end-to-end encryption now holds against a compromised relay. Phones keep
  a member list in the encrypted log and only accept a new family key wrapped by a member;
  removing a phone wraps the new key for members only. Phones the relay lists but no member
  added show as "Unknown phone" with a warning. Sealed data is bound to its family, purpose
  and key epoch (XChaCha20-Poly1305 associated data, `v2.` format), so old wrapped keys
  cannot be replayed. Partner sync shows a safety code to compare between the phones.
  Invite codes carry the inviting phone's id. Phones on 0.6 cannot read changes from 0.7:
  update both phones (they reinstall for #40 anyway).
- Security (#42): checked that other apps cannot trigger the widget's buttons. The
  widget library declares its click receiver `android:exported="false"`, so a broadcast
  from another app never reaches it; CI now reads each APK's manifest and fails if that
  receiver becomes exported (`.github/scripts/verify-apk-manifest.sh`).
- CI: Maestro 2.12.1 is installed from its GitHub release (checksum checked, cached)
  instead of the get.maestro.mobile.dev installer, whose outage failed every E2E run.
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
