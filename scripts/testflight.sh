#!/bin/zsh
# Frontlinie 3 – baut den aktuellen Stand von main und lädt ihn zu TestFlight hoch.
# Läuft auf Kristians Mac (Xcode ist dort mit dem Developer-Team angemeldet). Aufruf: scripts/testflight.sh
# Arbeitet in einer eigenen Kopie des Repos, damit der normale Arbeitsordner unberührt bleibt.
# Die Build-Nummer ist die Zahl der Commits auf main: Sie steigt mit jeder Änderung von selbst,
# niemand muss sie mehr von Hand erhöhen. Ist der Stand schon hochgeladen, passiert nichts.
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="git@github.com:KvB1982/Frontline.git"
TEAM="AX2SZQVU9L"
WORK="$HOME/Library/Caches/frontlinie3-testflight"
SRC="$WORK/src"
DONE="$WORK/hochgeladen.txt"          # letzter hochgeladener Commit
mkdir -p "$WORK"

# nie zweimal gleichzeitig
if ! mkdir "$WORK/lock" 2>/dev/null; then
  if [ -n "$(find "$WORK/lock" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then rmdir "$WORK/lock"; mkdir "$WORK/lock"; else echo "läuft bereits"; exit 0; fi
fi
trap 'rmdir "$WORK/lock" 2>/dev/null || true' EXIT

if [ ! -d "$SRC/.git" ]; then git clone -q "$REPO" "$SRC"; fi
cd "$SRC"
git fetch -q origin main
git checkout -q --detach origin/main
git reset -q --hard origin/main
git clean -qfd -e node_modules

HEAD_SHA="$(git rev-parse HEAD)"
if [ -f "$DONE" ] && [ "$(cat "$DONE")" = "$HEAD_SHA" ]; then echo "nichts Neues ($HEAD_SHA)"; exit 0; fi
BUILD="$(git rev-list --count HEAD)"
echo "$(date '+%d.%m.%Y %H:%M') Build $BUILD aus $HEAD_SHA"

npm ci --silent
node scripts/copy-web.mjs
# Die Version steht auf dem Steuerknüppel-Bildschirm, damit man iPad und iPhone vergleichen kann.
sed -i '' -E "s/^FL\.BUILD = [0-9]+;/FL.BUILD = $BUILD;/" www/js/core.js
grep -q "^FL.BUILD = $BUILD;" www/js/core.js
npx cap sync ios

cat > "$WORK/export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>teamID</key><string>$TEAM</string>
<key>destination</key><string>upload</string>
<key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST

rm -rf "$WORK/App.xcarchive" "$WORK/export"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$WORK/App.xcarchive" -allowProvisioningUpdates CURRENT_PROJECT_VERSION="$BUILD" archive > "$WORK/archive.log" 2>&1 \
  || { echo "Archiv fehlgeschlagen, siehe $WORK/archive.log"; exit 1; }
xcodebuild -exportArchive -archivePath "$WORK/App.xcarchive" -exportOptionsPlist "$WORK/export.plist" \
  -exportPath "$WORK/export" -allowProvisioningUpdates > "$WORK/export.log" 2>&1 \
  || { echo "Upload fehlgeschlagen, siehe $WORK/export.log"; exit 1; }
grep -q "Upload succeeded" "$WORK/export.log" || { echo "Upload nicht bestätigt, siehe $WORK/export.log"; exit 1; }

echo "$HEAD_SHA" > "$DONE"
echo "Build $BUILD hochgeladen"
