// Extends app.json. Firebase (push) is optional: when google-services.json is present
// (CI writes it from the GOOGLE_SERVICES_JSON secret), the build can receive pushes from
// the sync server; without it the app schedules reminders on the phone itself.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(googleServices)) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile: './google-services.json' },
  };
};
