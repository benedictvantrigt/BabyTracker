# Privacy statement

Last updated: 9 November 2026. Applies to the Baby Tracker app for Android and iPhone and
its sync server ("the relay").

## In short

- Everything you log (feeds, sleep, diapers, notes, tags, the baby's name and dates) is
  stored on your phone. There is no account, no advertising and no analytics or tracking.
- If you turn on partner sync, your entries travel between your phones through the relay,
  **end-to-end encrypted**. The relay and the people running it cannot read them.
- The relay keeps the few technical details it needs to pass data between your phones
  and send notifications. They are listed below.

## Data on your phone

The app keeps its database on the phone. It does not leave the phone unless you turn on
partner sync. Uninstalling the app removes it. Android's own device backup may include the
app's data, under your Google account's settings.

The camera is only used to scan your partner's invite QR code. Images are not stored or
sent anywhere.

## Partner sync and the relay

Partner sync is optional. When you turn it on, the app creates a random family ID and a
family key. The key only exists on your phones: it travels from phone to phone inside the
invite QR code, never through the relay.

Each change you log is encrypted on the phone with the family key (XChaCha20-Poly1305)
before it is sent. The relay stores and forwards this ciphertext; it cannot decrypt it.

What the relay can see and stores, per family:

| Data | Why | How long |
|---|---|---|
| Random family ID | To group your phones | Until you delete the family |
| Each phone's public key (also its device ID) | To check that requests come from a phone in the family | Until the phone is removed or the family is deleted |
| Encrypted changes, with the time they were sent and which phone sent them | To pass entries between your phones | Deleted once every phone in the family has received them |
| Encrypted phone names and wrapped family keys | To show the phone list and hand a new key to the remaining phones after one is removed | Until the phone is removed or the family is deleted |
| Push notification token per phone, and whether that phone wants reminders | To wake the phones and deliver reminders | Until the phone is removed, gets a new token, or the family is deleted |
| Upcoming reminders: fire time and encrypted text | To send reminders at the right time, also to the partner's phone | Until they fire or are replaced (at most 2 days ahead) |
| Invite codes (stored as a hash) | To let a partner's phone join | Single use, expire after 15 minutes |
| Time each phone last synced | To know which changes every phone has received | Until the phone is removed or the family is deleted |

The relay does not save IP addresses in its database. It runs on Cloudflare Workers:
Cloudflare processes the network traffic (including IP addresses) to deliver it, and keeps
request logs for a few days to operate and debug the relay, under the
[Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/). These logs do not
contain your entries, which are encrypted.

## Notifications

Reminders and sync nudges reach the phones through Firebase Cloud Messaging (Android) and
Apple Push Notification service (iPhone). Their content is encrypted for your phones; Google
and Apple only see the push token, the time and the encrypted payload. Live timers on the
iPhone lock screen, when updated by push, carry only a start time and a generic label.
Without partner sync, the phone schedules its reminders itself and nothing is sent.

## Deleting your data

- **Remove a phone:** Settings → Partner sync → Remove. The relay deletes its push token
  and name; the other phones get a new family key.
- **Delete the family:** Settings → Partner sync → Delete family. The relay deletes
  everything it holds about the family. Each phone keeps its own entries.
- **Data on the phone:** delete entries in the app, or uninstall it.

## Children

The app is meant for parents and caregivers, not for use by children. The data about the
baby is entered by the parents and stays on their phones, encrypted when synced.

## Health information

The sleep schedule and reminders are general guidance, not medical advice. Ask your doctor
or child health nurse when in doubt.

## Changes and contact

Changes to this statement are published at this address with a new date. Questions:
open an issue at <https://github.com/benedictvantrigt/BabyTracker/issues>.
