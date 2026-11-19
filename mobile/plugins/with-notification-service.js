// Adds the iOS notification service extension that decrypts reminders the relay pushes (#6).
// Only in builds with IOS_NOTIFICATION_SERVICE=1 (app.config.js): the App Store build needs an
// App Store profile for <bundle id>.NotificationService, which CI installs when the secret
// IOS_PROFILE_NSE_BASE64 is set (README, App Store). Sources: plugins/notification-service/.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const TARGET = 'NotificationService';
const SOURCES = ['NotificationService.swift', 'XChaCha20Poly1305.swift'];
const INFO_PLIST = `${TARGET}-Info.plist`;
const ENTITLEMENTS = `${TARGET}.entitlements`;
const DEPLOYMENT_TARGET = '15.1';

function infoPlist(version, build) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${TARGET}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${build}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;
}

function entitlements(appGroup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`;
}

function withExtensionFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      for (const file of SOURCES) {
        fs.copyFileSync(path.join(__dirname, 'notification-service', file), path.join(dir, file));
      }
      const version = cfg.version ?? '1.0.0';
      const build = cfg.ios?.buildNumber ?? '1';
      fs.writeFileSync(path.join(dir, INFO_PLIST), infoPlist(version, build));
      fs.writeFileSync(
        path.join(dir, ENTITLEMENTS),
        entitlements(`group.${cfg.ios.bundleIdentifier}`),
      );
      return cfg;
    },
  ]);
}

function withExtensionTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    if (project.pbxTargetByName(TARGET)) return cfg;

    const group = project.addPbxGroup([...SOURCES, INFO_PLIST, ENTITLEMENTS], TARGET, TARGET);
    const groups = project.hash.project.objects.PBXGroup;
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      if (typeof g === 'object' && g.name === undefined && g.path === undefined) {
        project.addToPbxGroup(group.uuid, key);
      }
    }

    // addTarget expects these sections to exist.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    const bundleId = `${cfg.ios.bundleIdentifier}.${TARGET}`;
    // An app extension target is also embedded into the app (Copy Files, PlugIns).
    const target = project.addTarget(TARGET, 'app_extension', TARGET, bundleId);
    project.addBuildPhase(SOURCES, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== `"${TARGET}"`) continue;
      settings.PRODUCT_BUNDLE_IDENTIFIER = bundleId;
      settings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
      settings.TARGETED_DEVICE_FAMILY = '"1,2"';
      settings.SWIFT_VERSION = '5.0';
      settings.CODE_SIGN_ENTITLEMENTS = `${TARGET}/${ENTITLEMENTS}`;
      settings.CODE_SIGN_STYLE = 'Automatic';
      settings.GENERATE_INFOPLIST_FILE = 'NO';
      settings.MARKETING_VERSION = cfg.version ?? '1.0.0';
      settings.CURRENT_PROJECT_VERSION = cfg.ios?.buildNumber ?? '1';
    }
    return cfg;
  });
}

module.exports = function withNotificationService(config) {
  return withExtensionTarget(withExtensionFiles(config));
};
