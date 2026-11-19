// Extends app.json.
// APP_VARIANT=acceptance builds the acceptance app: its own package and name, so it installs
// next to the production app and talks to the acceptance relay and Firebase project.
// Firebase (push) is optional: when google-services.json is present (CI writes it from the
// GOOGLE_SERVICES_JSON_ACC / _PROD secret), the build can receive pushes from the sync
// server; without it the app schedules reminders on the phone itself.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // One build number for both stores: the iOS build number follows android.versionCode, which
  // goes up by one per release (README, Versions and branches).
  config = {
    ...config,
    ios: { ...config.ios, buildNumber: String(config.android.versionCode) },
  };
  if (process.env.APP_VARIANT === 'acceptance') {
    config = {
      ...config,
      name: `${config.name} (acc)`,
      scheme: `${config.scheme}-acc`,
      ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.acc` },
      android: { ...config.android, package: `${config.android.package}.acc` },
    };
  }
  // The iOS notification service extension that decrypts pushed reminders (#6). CI turns it on
  // when the App Store profile for the extension is available (README, App Store); without it
  // the iPhone sends the relay no push token and schedules its reminders itself.
  if (process.env.IOS_NOTIFICATION_SERVICE === '1') {
    config = {
      ...config,
      plugins: [...(config.plugins ?? []), './plugins/with-notification-service'],
      extra: { ...config.extra, iosNotificationService: true },
    };
  }
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
  };
};
