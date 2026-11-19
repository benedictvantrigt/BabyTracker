# App Store listing and declarations

What is entered in App Store Connect for the iPhone app (app "Napchime", Apple ID 6836845283).
It follows the Play listing (`docs/store-listing.md`) and describes only what the iOS build
does: no home-screen widget yet (#16), and reminders from the partner's phone arrive when the
app syncs, not by push (#6).

## Status in App Store Connect (2026-11-19)

| Item | Status |
|---|---|
| App Information (subtitle, categories, content rights, age rating) | Saved |
| Pricing and availability | Free; 174 countries and regions, France left out (export compliance, README "App Store") |
| App Privacy | Published |
| Version 0.10.0 texts, URLs, copyright, App Review information | Saved; release: manual |
| Screenshots | **To do**, same as on Play: staged data on an iPhone (6.9" or 6.5" display) |
| EU trader status (DSA) | **To do** in Business before release in the EU. The membership is individual, so the App Store lists the seller as Benedict van Trigt |
| Submission for review | Not yet; TestFlight only |

## App Information

| Field | Value |
|---|---|
| Name (max 30) | Napchime |
| Subtitle (max 30) | Baby rhythm and nap reminders |
| Primary language | English (U.S.) |
| Bundle ID / SKU | `com.napchime.app` / `napchime` |
| Category | Health & Fitness; secondary Lifestyle (the App Store has no Parenting category) |
| Content rights | Does not contain, show or access third-party content |
| Age rating | 9+ (4+ before iOS 26): every question No/None except "Health or Wellness Topics" = Yes for the sleep schedule. Not Made for Kids |

Play rates the app Everyone / PEGI 3; Apple's questionnaire counts self-care and lifestyle
recommendations (the age-based nap schedule) as wellness content, which gives 9+.

## Version page

| Field | Value |
|---|---|
| Version | 0.10.0 (matches `expo.version`) |
| Promotional text (max 170) | Baby day rhythm, nap reminders and a private log you share with your partner. |
| Keywords (max 100) | baby tracker,newborn,sleep,nap,schedule,feeding,breastfeeding,diaper,pumping,growth,log,parenting |
| Support URL | https://github.com/benedictvantrigt/BabyTracker |
| Marketing URL | (none) |
| Copyright | 2026 ITER IT |
| Release | Manually release this version |

### Description (max 4000)

The App Store shows plain text, so the Play headings are capitals here.

> Napchime keeps track of your baby's day and tells you when the next nap is due.
>
> A DAY RHYTHM FOR YOUR BABY'S AGE
> Follow an example nap schedule for your baby's age, from the first weeks up to 4 years.
> Napchime shows today's planned naps and bedtime, what your baby has slept so far, and
> reminds you when the next nap or feed is coming up.
>
> LOG EVERYTHING WITH ONE TAP
> - Feeds: breastfeeding (side and timer), bottle with breast milk or formula, and solids
> - Sleep, with a timer that keeps running on the lock screen
> - Diapers
> - Tummy time, pumping, temperature and growth
> - Notes and tags on any entry
>
> SEE THE DAY AT A GLANCE
> The Today screen shows the time since the last feed, sleep and diaper, today's totals and
> what's next. Choose which cards you see and in which order. Running timers, and how long
> your baby has been awake before the next nap, show as a Live Activity on the lock screen.
>
> SHARE WITH YOUR PARTNER, PRIVATELY
> Link a second phone by scanning a QR code. Entries appear on both phones. Everything is
> end-to-end encrypted: only your phones can read it.
>
> NO ACCOUNT, NO ADS, NO TRACKING
> Your data stays on your phones. There is no sign-up, no advertising and no analytics.
>
> The sleep schedule is general guidance, not medical advice. Every baby is different; ask
> your doctor or nurse if you have concerns.

Differences from Play: no home-screen widget sentence (Android only so far), the Live
Activity instead, and no "reminders reach both of you" (iPhones get no relay pushes yet).
Update both when #16 and #6 land.

## App Review information

Contact: Benedict van Trigt, info@iter-it.nl; the phone number is entered in App Store Connect
only (not kept in this public repository). Sign-in required: no.

Notes:

> No account or password exists. Open the app, enter any baby name and birth date: all
> features work.
>
> Partner sync is optional and pairs two phones by QR code, no login: on phone A open
> Settings > Partner sync > Invite partner; on phone B install the app, choose "Join your
> partner" on the first screen and scan the QR code shown on phone A. Entries then appear on
> both phones. To test with one device, use the iOS Simulator or an Android phone as phone B.
>
> Running timers (sleep, feeding) show as a Live Activity on the lock screen. Night-feed
> reminders use time-sensitive notifications.
>
> The app uses standard encryption (end-to-end encrypted sync) under the mass-market
> exemption; no proprietary cryptography.

## App Privacy

| Question | Answer |
|---|---|
| Privacy policy URL | https://benedictvantrigt.github.io/BabyTracker/privacy/ |
| Data collected? | Yes |
| Data types | Identifiers → **Device ID**: the device's public key and push token, kept by the relay |
| Purpose | App Functionality |
| Linked to the user? | Yes: Apple counts anything that is personal data under privacy law as linked, and a push token or device key is an online identifier under the GDPR |
| Tracking? | No |
| Not declared | The baby's records (end-to-end encrypted, the relay can't read them), contact info, location, usage data, diagnostics: the app has no analytics |

Same decision as Play's Data safety: the encrypted records are not declared as health data.
Revisit if a reviewer asks.

## Other settings

- Mac (Apple silicon) and Apple Vision Pro availability, and the Apple School Manager volume
  discount, are left at Apple's defaults (on). The app is built for iPhone only.
