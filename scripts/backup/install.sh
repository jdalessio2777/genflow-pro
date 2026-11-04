#!/bin/bash
# Copies the backup scripts to where the scheduled job runs them, and optionally loads the schedule.
# Usage: scripts/backup/install.sh            copy the scripts only
#        scripts/backup/install.sh --schedule copy the scripts and load the launchd job (3 AM, plus catch-up times)
# The runner program is NOT rebuilt here: Full Disk Access is tied to that exact binary.
set +x
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/GenFlowBackup"
LABEL="com.genshield.genflow-backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -x "$APP/genflow-backup-runner" ] || { echo "Runner missing at $APP. See docs/backups.md."; exit 1; }
/bin/cp "$HERE/genflow-backup.sh" "$APP/genflow-backup.sh"
/bin/cp "$HERE/download-storage.mjs" "$APP/download-storage.mjs"
/bin/cp "$HERE/RESTORE.md" "$APP/RESTORE.md"
/bin/mkdir -p "$APP/logs"
echo "Scripts installed to $APP"

[ "${1:-}" = "--schedule" ] || exit 0

/bin/cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$APP/genflow-backup-runner</string></array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>17</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$APP/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$APP/logs/launchd.err.log</string>
</dict>
</plist>
EOF
/usr/bin/plutil -lint "$PLIST"
/bin/launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Schedule loaded: $LABEL"
