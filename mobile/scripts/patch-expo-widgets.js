// Runs after `npm install` / `npm ci`. Two changes to expo-widgets' AppIntent.swift:
//
// 1. A home-screen widget button's intent runs in the app's process instead of the widget
//    extension's (#16): iOS does that for a LiveActivityIntent and wakes the app in the
//    background if needed, so a tap on the closed app can still write the entry and sync it
//    (src/widget/home-widget-sync.ios.ts). The intent stays the same otherwise.
// 2. A Live Activity button's intent (#97) also keeps the tap in the app group's UserDefaults:
//    the intent only posts a notification, which JS misses while the app is still starting
//    after the tap woke it. JS takes the kept taps through modules/widget-wake.
//
// Fails when expo-widgets changed this code, so an update can't silently undo it: check the
// new AppIntent.swift, then update or drop this patch.
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-widgets',
  'ios',
  'Widgets',
  'AppIntent.swift',
);

const patches = [
  {
    name: 'widget taps run in the app (WidgetUserInteraction)',
    original: 'struct WidgetUserInteraction: AppIntent {',
    patched: 'struct WidgetUserInteraction: LiveActivityIntent {',
  },
  {
    name: 'Live Activity button taps are kept for the app (LiveActivityUserInteraction)',
    original: [
      '  func perform() async throws -> some IntentResult {',
      '    WidgetsEvents.shared.sendNotification(type: .userEvent, data: [',
    ].join('\n'),
    patched: [
      '  func perform() async throws -> some IntentResult {',
      '    // Napchime (scripts/patch-expo-widgets.js): keep the tap for the app, which may still',
      '    // be starting; modules/widget-wake hands the kept taps to JS.',
      '    var napchimeTaps = (WidgetsStorage.getArray(forKey: "napchime_live_taps") as? [[String: Any]]) ?? []',
      '    napchimeTaps.append(["target": target ?? "", "at": Date().timeIntervalSince1970 * 1000])',
      '    WidgetsStorage.set(Array(napchimeTaps.suffix(20)), forKey: "napchime_live_taps")',
      '    WidgetsEvents.shared.sendNotification(type: .userEvent, data: [',
    ].join('\n'),
  },
];

if (!fs.existsSync(file)) {
  console.log('patch-expo-widgets: expo-widgets is not installed, nothing to patch');
  process.exit(0);
}
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
for (const { name, original, patched } of patches) {
  if (source.includes(patched)) continue;
  if (source.split(original).length !== 2) {
    console.error(`patch-expo-widgets: "${original.split('\n')[0]}…" not found once in ${file}; see this script.`);
    process.exit(1);
  }
  source = source.replace(original, patched);
  console.log(`patch-expo-widgets: ${name}`);
}
fs.writeFileSync(file, source);
