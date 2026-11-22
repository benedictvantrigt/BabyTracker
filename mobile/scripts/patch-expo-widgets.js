// Runs after `npm install` / `npm ci`. Makes a home-screen widget button's intent run in the
// app's process instead of the widget extension's (#16): iOS does that for a LiveActivityIntent
// and wakes the app in the background if needed, so a tap on the closed app can still write the
// entry and sync it (src/widget/home-widget-sync.ios.ts). The intent stays the same otherwise.
//
// Fails when expo-widgets changed this line, so an update can't silently undo it: check the new
// AppIntent.swift, then update or drop this patch.
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
const original = 'struct WidgetUserInteraction: AppIntent {';
const patched = 'struct WidgetUserInteraction: LiveActivityIntent {';

if (!fs.existsSync(file)) {
  console.log('patch-expo-widgets: expo-widgets is not installed, nothing to patch');
  process.exit(0);
}
const source = fs.readFileSync(file, 'utf8');
if (source.includes(patched)) process.exit(0);
if (!source.includes(original)) {
  console.error(`patch-expo-widgets: "${original}" not found in ${file}; see this script.`);
  process.exit(1);
}
fs.writeFileSync(file, source.replace(original, patched));
console.log('patch-expo-widgets: widget taps run in the app (WidgetUserInteraction)');
