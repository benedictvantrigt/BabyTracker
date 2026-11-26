// Runs after `npm install` / `npm ci`. react-native-android-widget throws a tap away when the
// size it measures from the tap differs from the size the widget was drawn at, and redraws it:
// the drawn buttons and the tap areas might disagree. On a real phone that ate taps now and
// then (the launcher reports other sizes during its animations, after a restart or a change
// of the home screen), so a button seemed not to respond. Napchime's buttons sit apart and
// every action can be undone, so the tap is carried out anyway; the redraw still happens.
//
// Fails when the library changed these lines, so an update can't silently undo it: check the
// new RNWidgetProvider.java, then update or drop this patch.
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-android-widget',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativeandroidwidget',
  'RNWidgetProvider.java',
);
const MARK = '// Napchime: taps are not dropped';
const replacements = [
  [
    `            // Before correction, the image and hit areas may disagree. Consume this tap
            // instead of executing a potentially unintended custom or native action.
            return;
        }
        // A second tap can arrive before the corrective render replaces the old overlays.
        if (RNWidgetSizing.hasOutdatedSize(context, widgetId, incomingIntent)) return;`,
    `            ${MARK} (scripts/patch-android-widget.js).
        } else if (RNWidgetSizing.hasOutdatedSize(context, widgetId, incomingIntent)) {
            // Drawn at an older size: redraw, and still carry out the tap.
            RNWidgetSizing.updateStoredSize(context, widgetId);
            Data resizeData = RNWidgetJsCommunication.buildData(context, getClass().getSimpleName(), widgetId, "WIDGET_RESIZED");
            RNWidgetJsCommunication.startBackgroundTask(context, resizeData);
        }`,
  ],
];

if (!fs.existsSync(file)) {
  console.log('patch-android-widget: react-native-android-widget is not installed, nothing to patch');
  process.exit(0);
}
let source = fs.readFileSync(file, 'utf8');
if (source.includes(MARK)) process.exit(0);
const eol = source.includes('\r\n') ? '\r\n' : '\n';
source = source.replace(/\r\n/g, '\n');
for (const [original, patched] of replacements) {
  if (!source.includes(original)) {
    console.error(`patch-android-widget: expected code not found in ${file}; see this script.`);
    process.exit(1);
  }
  source = source.replace(original, patched);
}
fs.writeFileSync(file, source.replace(/\n/g, eol));
console.log('patch-android-widget: widget taps are carried out after a size correction');
