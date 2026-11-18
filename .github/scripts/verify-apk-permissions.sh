#!/usr/bin/env bash
# Checks that an APK asks for exactly the permissions Napchime needs. Libraries merge in
# permissions of their own (Expo's template, badge counters, biometrics, install referrer);
# `blockedPermissions` in mobile/app.json removes the ones we don't use, and this check fails
# when a library update adds a new one. To allow a permission, add it here and say why.
# Usage: verify-apk-permissions.sh <apk>
set -euo pipefail
apk="$1"

allowed=(
  android.permission.INTERNET                   # relay sync
  android.permission.ACCESS_NETWORK_STATE       # sync when back online
  android.permission.CAMERA                     # scanning the partner's QR code
  android.permission.POST_NOTIFICATIONS         # reminders and running timers
  android.permission.POST_PROMOTED_NOTIFICATIONS # live timer (Android 16 Live Updates)
  android.permission.SCHEDULE_EXACT_ALARM       # reminders on time
  android.permission.RECEIVE_BOOT_COMPLETED     # reschedule reminders after a restart
  android.permission.WAKE_LOCK                  # push messages and alarms (FCM, expo-notifications)
  android.permission.VIBRATE                    # notification vibration
  android.permission.FOREGROUND_SERVICE         # declared by a dependency's service
  com.google.android.c2dm.permission.RECEIVE    # push messages (FCM)
)

aapt2=$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 | sort -V | tail -1)
package=$("$aapt2" dump packagename "$apk")
# AndroidX declares this signature permission for its own receivers; it grants nothing.
allowed+=("$package.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")

mapfile -t requested < <("$aapt2" dump permissions "$apk" \
  | sed -n "s/^uses-permission[^:]*: name='\([^']*\)'.*/\1/p" | sort -u)

echo "Permissions in $apk:"
printf '  %s\n' "${requested[@]}"

extra=()
for p in "${requested[@]}"; do
  ok=false
  for a in "${allowed[@]}"; do [ "$p" = "$a" ] && ok=true && break; done
  $ok || extra+=("$p")
done

if [ "${#extra[@]}" -gt 0 ]; then
  echo "::error::The APK asks for permissions that are not on the list in $0: ${extra[*]}. Block them in mobile/app.json (android.blockedPermissions) or allow them here with a reason."
  exit 1
fi
echo "Only allowed permissions."
