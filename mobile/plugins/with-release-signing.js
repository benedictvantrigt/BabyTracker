// Release builds are signed with our own key instead of the template's debug.keystore, whose
// password ("android") and key ship with every Expo/React Native project (#40).
//
// The key is read when Gradle runs, from these environment variables:
//   ANDROID_KEYSTORE_PATH       path to the keystore file (PKCS12 or JKS)
//   ANDROID_KEYSTORE_PASSWORD   keystore password
//   ANDROID_KEY_ALIAS           key alias
//   ANDROID_KEY_PASSWORD        key password (PKCS12: the same as the keystore password)
// Without ANDROID_KEYSTORE_PATH, release builds keep the debug key (local test builds only;
// CI refuses to publish such an APK).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @babytracker release-signing';

const SIGNING_CONFIG = `signingConfigs {
        ${MARKER}
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

const RELEASE_SIGNING =
  "signingConfig = System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug";

function applyReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const signingConfigs = /signingConfigs\s*\{/;
  if (!signingConfigs.test(gradle)) {
    throw new Error('with-release-signing: no signingConfigs block in android/app/build.gradle');
  }
  let out = gradle.replace(signingConfigs, SIGNING_CONFIG);

  // The release build type's signingConfig, after "buildTypes {" and its "release {".
  const buildTypes = out.indexOf('buildTypes {');
  const release = buildTypes < 0 ? -1 : out.indexOf('release {', buildTypes);
  const line = release < 0 ? -1 : out.indexOf('signingConfig signingConfigs.debug', release);
  if (line < 0) {
    throw new Error('with-release-signing: release build type not found in android/app/build.gradle');
  }
  out =
    out.slice(0, line) +
    RELEASE_SIGNING +
    out.slice(line + 'signingConfig signingConfigs.debug'.length);
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('with-release-signing: expected a Groovy android/app/build.gradle');
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
