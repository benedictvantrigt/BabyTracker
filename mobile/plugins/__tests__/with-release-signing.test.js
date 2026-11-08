const fs = require('fs');
const path = require('path');

const { applyReleaseSigning } = require('../with-release-signing');

// android/app/build.gradle of expo-template-bare-minimum 58.0.32 (what `expo prebuild` starts from).
const template = fs.readFileSync(path.join(__dirname, 'fixtures/template-build.gradle'), 'utf8');

function releaseBuildType(gradle) {
  const start = gradle.indexOf('release {', gradle.indexOf('buildTypes {'));
  return gradle.slice(start, gradle.indexOf('}', start));
}

describe('applyReleaseSigning', () => {
  it('starts from a template that signs release builds with the debug key', () => {
    expect(releaseBuildType(template)).toContain('signingConfig signingConfigs.debug');
  });

  it('adds a release signing config read from the environment', () => {
    const out = applyReleaseSigning(template);
    expect(out).toContain("storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))");
    expect(out).toContain("keyAlias System.getenv('ANDROID_KEY_ALIAS')");
  });

  it('signs release builds with it when a keystore is given', () => {
    expect(releaseBuildType(applyReleaseSigning(template))).toContain(
      "signingConfig = System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
  });

  it('leaves debug builds on the debug key', () => {
    const out = applyReleaseSigning(template);
    const debug = out.slice(out.indexOf('debug {', out.indexOf('buildTypes {')));
    expect(debug.slice(0, debug.indexOf('}'))).toContain('signingConfig signingConfigs.debug');
  });

  it('is idempotent', () => {
    const once = applyReleaseSigning(template);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it('fails loudly when the template changes shape', () => {
    expect(() => applyReleaseSigning('android {}')).toThrow(/signingConfigs/);
  });
});
