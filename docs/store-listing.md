# Google Play store listing and declarations

Draft for the first Play Console submission (#50, #43, #44, #45). It describes only what the
Android build does. Items marked **CHECK** need a decision before they go into Play Console.

## App details

| Field | Value |
|---|---|
| App name (max 30) | Napchime |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free |
| Category | Parenting |
| Tags | Baby tracker, Sleep tracker, Parenting |
| Contact email | info@iter-it.nl (shown on the listing) |
| Developer | ITER IT, Bestevaerstraat 128, Amsterdam, the Netherlands |
| Website | https://github.com/benedictvantrigt/BabyTracker |
| Privacy policy | https://benedictvantrigt.github.io/BabyTracker/privacy/ |

## Short description (max 80)

> Baby day rhythm, nap reminders and a private log you share with your partner.

(78 characters)

## Full description (max 4000)

> Napchime keeps track of your baby's day and tells you when the next nap is due.
>
> **A day rhythm for your baby's age**
> Follow an example nap schedule for your baby's age, from the first weeks up to 4 years.
> Napchime shows today's planned naps and bedtime, what your baby has slept so far, and
> reminds you when the next nap or feed is coming up.
>
> **Log everything with one tap**
> - Feeds: breastfeeding (side and timer), bottle with breast milk or formula, and solids
> - Sleep, with a timer that keeps running on the lock screen
> - Diapers
> - Tummy time, pumping, temperature and growth
> - Notes and tags on any entry
>
> **See the day at a glance**
> The Today screen shows the time since the last feed, sleep and diaper, today's totals and
> what's next. Choose which cards you see and in which order. With the home-screen widget
> you start a sleep or log a diaper without opening the app.
>
> **Share with your partner, privately**
> Link a second phone by scanning a QR code. Entries appear on both phones, and reminders
> reach both of you. Everything is end-to-end encrypted: only your phones can read it.
>
> **No account, no ads, no tracking**
> Your data stays on your phones. There is no sign-up, no advertising and no analytics.
>
> The sleep schedule is general guidance, not medical advice. Every baby is different; ask
> your doctor or nurse if you have concerns.

The age range matches the stages in `mobile/src/domain/sleep-schedule.ts` (0 weeks to
3–4 years).

## Graphics (to make)

- App icon 512×512 PNG (from `mobile/assets/images/icon.png`)
- Feature graphic 1024×500
- Phone screenshots, at least 2 (recommended 4–8), 16:9 or 9:16: Today screen, sleep plan,
  timeline, an entry form, partner sync

## App content declarations

| Declaration | Answer |
|---|---|
| Privacy policy | URL above |
| Ads | No ads |
| App access | All functionality is available without special access. Reviewer note below. |
| Content rating (IARC) | Utility/productivity-type app; no violence, sexual content, gambling, user-to-user chat or location sharing. Expected rating: Everyone / PEGI 3 |
| Target audience | 18 and over (parents). Not designed for children, so the Families policy does not apply |
| News app | No |
| Government app | No |
| Financial features | None |
| Health apps | Yes: tracks a baby's sleep, feeding, temperature and growth (category "Health and fitness" → baby care / sleep tracking). Not a medical device; no diagnosis or treatment |
| Data safety | See below |

### Reviewer note (App access)

> Napchime works without an account: open the app, enter a baby's name and date of birth,
> and every feature except partner sync is available. Partner sync is optional and needs a
> second phone: on phone A open Settings → Partner sync → Invite, and on phone B choose
> "Join your partner" on the first screen and scan the QR code.

### Data safety

Google does not count data that is end-to-end encrypted so that we can't read it as
"collected". What the relay can read must be declared.

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Yes (collected, not shared) |
| Encrypted in transit? | Yes |
| Can users request deletion? | Yes: "Delete family" in the app deletes all relay data; uninstalling deletes data on the phone |
| Data types collected | **Device or other IDs**: the device's public key and push token, for app functionality (sync and reminders). Optional: only when partner sync is used |
| Not collected | Personal info, health and fitness, location, photos, contacts, app activity, crash logs: the baby's records are end-to-end encrypted, and the app has no analytics |

Decided: the encrypted baby records are not declared as "Health info", relying on Google's
exemption for end-to-end encrypted data. Revisit if a reviewer asks.

## Account-level (Play Console, not per app)

- **EU trader status (DSA)**: ITER IT publishes the app as a business, so declare it as a
  trader; Play then shows the address, phone number and email on the listing. The phone
  number is entered in Play Console only (not kept in this public repository).
- **D-U-N-S / organisation verification**: done when creating the account.
