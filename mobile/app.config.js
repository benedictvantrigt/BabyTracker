// Extends app.json.
// APP_VARIANT=acceptance builds the acceptance app: its own package and name, so it installs
// next to the production app and talks to the acceptance relay and Firebase project.
// Firebase (push) is optional: when google-services.json is present (CI writes it from the
// GOOGLE_SERVICES_JSON_ACC / _PROD secret), the build can receive pushes from the sync
// server; without it the app schedules reminders on the phone itself.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT === 'acceptance') {
    config = {
      ...config,
      name: `${config.name} (acc)`,
      scheme: `${config.scheme}-acc`,
      ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.acc` },
      android: { ...config.android, package: `${config.android.package}.acc` },
    };
  }
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
  };
};
