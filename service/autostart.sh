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
nohup /usr/bin/node service.js --boot --watch >/tmp/home-svc.stdout 2>&1 &
exit 0
