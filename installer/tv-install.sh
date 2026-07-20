#!/bin/sh
# webOS Custom Home — on-device installer (runs ON the TV via `ssh root@<ip> "sh -s"`).
#
# Installs the app straight from the GitHub release using the Homebrew Channel's
# own install service (which runs elevated and registers the launch point), then
# enables boot autostart + the HOME-button takeover and launches it. No ares-cli,
# no Node, no scp, no build — the TV downloads the ipk itself.
#
# Requires a ROOTED webOS TV (Homebrew Channel + SSH). Pinned to release v0.4.1.
# Everything here is reversible; nothing touches the read-only OS partitions.

APP_ID="tld.my.customhome"
IPK_URL="https://github.com/zzeppieri/webos-custom-home/releases/download/v0.4.1/tld.my.customhome_0.4.1_all.ipk"
IPK_HASH="703dffaaea0f899d81109a525c75dff024fa45df8425c81beba35361486bfaad"  # sha256 of the ipk
SVCDIR="/media/developer/apps/usr/palm/services/${APP_ID}.service"
INITD="/var/lib/webosbrew/init.d/50-customhome"
HB="luna://org.webosbrew.hbchannel.service/install"

fail () { echo "ERROR: $1" >&2; exit 1; }

echo "==> webOS Custom Home installer (v0.4.1)"

# --- sanity checks: is this actually a rooted webOS TV? ---
command -v luna-send >/dev/null 2>&1 || fail "luna-send not found — this doesn't look like a webOS TV."
[ -d /var/lib/webosbrew ] || fail "Homebrew Channel (webosbrew) not found — root the TV first (see the tutorial)."

# --- install via Homebrew Channel; hold the subscription open until it finishes ---
echo "==> Downloading + installing from GitHub (this can take up to a minute)..."
LOG="/tmp/customhome-install.$$.log"
timeout 180 luna-send -i -f "$HB" \
  "{\"ipkUrl\":\"${IPK_URL}\",\"ipkHash\":\"${IPK_HASH}\",\"subscribe\":true}" >"$LOG" 2>&1 &
BG=$!

ok=0; i=0
while [ $i -lt 90 ]; do
  if grep -q '"finished": *true' "$LOG" 2>/dev/null; then ok=1; break; fi
  if grep -q '"errorText"' "$LOG" 2>/dev/null; then break; fi
  sleep 2; i=$((i + 1))
done
kill "$BG" 2>/dev/null

if [ "$ok" -ne 1 ]; then
  echo "   last status from the TV:" >&2
  grep -oE '"(statusText|errorText)": *"[^"]*"' "$LOG" 2>/dev/null | tail -4 >&2
  rm -f "$LOG"
  fail "install did not complete."
fi
rm -f "$LOG"
echo "==> Installed."

# --- boot persistence + HOME-button takeover ---
if [ -f "$SVCDIR/autostart.sh" ]; then
  ln -sf "$SVCDIR/autostart.sh" "$INITD"
  echo "==> Boot autostart enabled."
  sh "$SVCDIR/autostart.sh" 2>/dev/null && echo "==> Launched + HOME watcher armed."
else
  echo "WARN: launcher service not found; the app is installed but won't take over boot/HOME." >&2
fi

echo ""
echo "✓ Done. Your custom home is installed and set to launch on every boot."
echo "  • Press HOME on the remote to jump to it from any app."
echo "  • If HOME doesn't work, your remote may use a different key code — see the tutorial, section 9."
echo "  • To customize apps/weather/icons, clone the repo and edit + redeploy."
