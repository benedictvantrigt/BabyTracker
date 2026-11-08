#!/usr/bin/env bash
# Checks the merged manifest of an APK (#42): the home-screen widget's receiver logs entries
# when it gets <package>.WIDGET_CLICK, so it must not be exported, or any app on the phone
# could log a diaper or start a sleep by sending that broadcast. react-native-android-widget
# 0.26.0 declares it android:exported="false"; this stops a library update from changing it.
# Usage: verify-apk-manifest.sh <apk>
set -euo pipefail
apk="$1"

aapt2=$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 | sort -V | tail -1)
"$aapt2" dump xmltree --file AndroidManifest.xml "$apk" | python3 -c '
import re, sys

# aapt2 prints one node per line, nested by indentation: "E: receiver (line=12)" for an
# element, "A: http://schemas.android.com/apk/res/android:exported(0x01010010)=false" for an
# attribute.
stack, receivers = [], []
for line in sys.stdin:
    m = re.match(r"(\s*)([EA]): (.*)", line)
    if not m:
        continue
    depth, kind, rest = len(m.group(1)), m.group(2), m.group(3)
    while stack and stack[-1]["depth"] >= depth:
        stack.pop()
    if kind == "E":
        node = {"depth": depth, "tag": rest.split()[0], "attrs": {}, "parents": [n["tag"] for n in stack]}
        stack.append(node)
        if node["tag"] == "receiver":
            node["actions"] = []
            receivers.append(node)
        elif node["tag"] == "action" and "receiver" in node["parents"]:
            receiver = next(n for n in reversed(stack) if n["tag"] == "receiver")
            node["receiver"] = receiver
        continue
    a = re.match(r"(?:\S+:)?(\w+)\(0x[0-9a-f]+\)=(.*)", rest)
    if not a or not stack:
        continue
    name, value = a.group(1), a.group(2)
    value = re.sub(r" \(Raw: .*\)$", "", value).strip("\"")
    node = stack[-1]
    node["attrs"][name] = value
    if node["tag"] == "action" and name == "name" and "receiver" in node:
        node["receiver"]["actions"].append(value)

def exported(r):
    value = r["attrs"].get("exported")
    if value is None:
        # Without the attribute a receiver with an intent filter is exported.
        return bool(r["actions"])
    return value not in ("false", "(type 0x12)0x0")

clicks = [r for r in receivers if any(a.endswith(".WIDGET_CLICK") for a in r["actions"])]
if not clicks:
    print("::error::No receiver handles WIDGET_CLICK; has the widget library changed?")
    sys.exit(1)
bad = [r["attrs"].get("name", "?") for r in clicks if exported(r)]
for r in receivers:
    print(("exported     " if exported(r) else "not exported ") + r["attrs"].get("name", "?"))
if bad:
    print("::error::Exported receiver(s) handling WIDGET_CLICK: " + ", ".join(bad)
          + ". Other apps could log entries through them (#42).")
    sys.exit(1)
print("Widget click receiver is not exported.")
'
