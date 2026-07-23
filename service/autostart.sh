#!/bin/sh
# webosbrew autostart — runs once at cold boot via run-parts (symlinked into
# /var/lib/webosbrew/init.d/ under a no-extension name). Starts the registered launcher
# service with --boot, which brings the custom home app to the foreground (retrying until
# the app manager is ready). Backgrounds the daemon and returns immediately so boot isn't
# blocked. Remove the init.d symlink (or uninstall the app) to disable. No OS files touched.
SVCDIR=/media/developer/apps/usr/palm/services/tld.my.customhome.service
[ -f "$SVCDIR/service.js" ] || exit 0
[ -f /tmp/home-svc.pid ] && kill -9 "$(cat /tmp/home-svc.pid)" 2>/dev/null
export NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs
cd "$SVCDIR"
# eARC EDITION ONLY (marker file present): re-elevate the service (idempotent) so it keeps the
# "all" LS2 group needed to call settingsservice for eARC recovery. ares-install/reinstall can
# reset the dev ACLs, so we re-run elevate on every cold boot and every deploy. The standard ipk
# omits the EARC marker, so it is NEVER elevated. No-op if hbchannel isn't installed.
ELEVATE=/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service
[ -f "$SVCDIR/EARC" ] && [ -x "$ELEVATE" ] && "$ELEVATE" tld.my.customhome.service >/dev/null 2>&1
nohup /usr/bin/node service.js --boot --watch >/tmp/home-svc.stdout 2>&1 &
exit 0
