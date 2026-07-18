# Tutorial: From a stock LG TV to a custom Home

This walks you all the way from an untouched LG webOS TV to booting straight into
your own home screen. Budget an hour the first time. Nothing here writes to
protected OS partitions — every step is reversible, and a full uninstall returns
the TV to stock.

**Contents**

1. [Decide: root vs. Developer Mode](#1-decide-root-vs-developer-mode)
2. [Enable access on the TV](#2-enable-access-on-the-tv)
3. [Install the tooling on your computer](#3-install-the-tooling-on-your-computer)
4. [Register your TV with ares](#4-register-your-tv-with-ares)
5. [Get the project and build it](#5-get-the-project-and-build-it)
6. [First deploy](#6-first-deploy)
7. [Make it yours (apps, weather, icons)](#7-make-it-yours-apps-weather-icons)
8. [Take over the Home button and boot](#8-take-over-the-home-button-and-boot)
9. [Find your remote's HOME key code](#9-find-your-remotes-home-key-code)
10. [Uninstall / revert](#10-uninstall--revert)

---

## 1. Decide: root vs. Developer Mode

| | LG Developer Mode | Root (Homebrew Channel) |
|---|---|---|
| Sideload & run the app | ✅ | ✅ |
| Home-button watcher | ⚠️ likely, unproven | ✅ |
| **Boot straight into the app** | ❌ | ✅ |
| Persistence | Session lapses wipe `/media/developer` | Survives reboots |

The blocker for the full experience is **persistence**, not permissions. If you
just want to *open* the launcher yourself, Developer Mode is enough. If you want
it to **be** your Home on every boot, you need root. This tutorial covers the
root path; Developer-Mode users can follow along and simply stop before
[step 8](#8-take-over-the-home-button-and-boot).

## 2. Enable access on the TV

**Root path (recommended):**

1. Enable Developer Mode first: install **Developer Mode** from the LG Content
   Store, sign in with a free LG developer account, toggle Dev Mode on.
2. Root the TV with the [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
   using the [rootmytv](https://rootmy.tv/) exploit for your firmware. Follow
   their instructions for your exact webOS version.
3. In the Homebrew Channel app, enable **Root system / SSH**.
4. From your computer, confirm SSH works:
   ```bash
   ssh root@<TV_IP>       # default password is often "alpine" — change it
   ```
5. **Recommended:** install an SSH key so deploys are keyless.
   ```bash
   ssh-copy-id root@<TV_IP>       # or append your pubkey to /home/root/.ssh/authorized_keys
   ```

Find `<TV_IP>` under **Settings → Network** on the TV. Give the TV a DHCP
reservation so the IP doesn't move.

**Developer-Mode-only path:** enable Dev Mode as above; sideloading uses the
dev-mode passphrase instead of SSH root. Skip the Homebrew steps.

## 3. Install the tooling on your computer

```bash
# Node 18+ (https://nodejs.org)
node -v

# webOS CLI — provides ares-setup-device, ares-package, ares-install, ares-launch
npm install -g @webos-tools/cli
ares-setup-device --version
```

## 4. Register your TV with ares

```bash
ares-setup-device
```

Add a device (name it **`tv`** to match the defaults). For a **rooted** TV use
`root` @ port `22` with your SSH key; for **Developer Mode** use the `prisoner`
account @ port `9922` with the dev-mode passphrase. Verify:

```bash
ares-setup-device --list
ares-launch --device tv --listApp     # should print the apps installed on your TV
```

That last command doubles as your source of truth for **app IDs** in step 7.

## 5. Get the project and build it

```bash
git clone https://github.com/zzeppieri/webos-custom-home.git
cd webos-custom-home
npm install
npm run dev        # optional: preview in a desktop browser at the printed URL
```

In the browser, LunaService calls no-op (you're not on the TV), but the layout,
clock, weather, and navigation all work — this is where you iterate on look.

## 6. First deploy

```bash
npm run deploy
```

If your ares profile isn't named `tv`, or the TV isn't at the default IP:

```bash
TV_DEVICE=myprofile TV_IP=192.168.1.50 npm run deploy
```

You should see build → package → install → launch, ending with
`✓ deployed; app launched + Home watcher re-armed`, and the app should appear on
the TV. If packaging errors with *"Failed to minify code,"* you're missing
`--no-minify` — the bundled script already includes it, so use `npm run deploy`.

## 7. Make it yours (apps, weather, icons)

**Apps** — edit [`src/lib/apps.ts`](../src/lib/apps.ts). Each tile:

```ts
{ id: 'netflix', title: 'Netflix', color: '#e50914', icon: 'icons/netflix.png' }
```

- `id` must be a real app ID from `ares-launch --device tv --listApp`.
- HDMI inputs use `launchType: 'input'`, e.g. `com.webos.app.hdmi2` for a PS5.
- The app also merges your TV's real launch points at runtime, dropping any it
  doesn't recognize into **Misc** — so unlisted apps still appear.

**Weather** — set your coordinates in
[`src/service/weather.ts`](../src/service/weather.ts). Open-Meteo needs no key.

**Icons** — drop `.png` files into [`public/icons/`](../public/icons/) and
reference them by `icons/<name>.png`. WAM sandboxes web apps, so you can't point
at another app's icon on disk — bundle a copy. Missing icons fall back to a
monogram.

Re-run `npm run deploy` after any change.

## 8. Take over the Home button and boot

*(Rooted TVs only.)*

`npm run deploy` already installs the in-package LunaService and starts it with
`--boot --watch`. To make it **survive reboots**, symlink the autostart hook into
webosbrew's init.d on the TV:

```bash
ssh root@<TV_IP>
SVC=/media/developer/apps/usr/palm/services/tld.my.customhome.service
ln -sf "$SVC/autostart.sh" /var/lib/webosbrew/init.d/49-custom-home
reboot
```

After reboot the TV should come up in your custom Home, and pressing **HOME** on
the remote should return to it from any app. How this works — the registered
service, the non-blocking input poll, and the wake-from-standby heartbeat — is
described in the [README](../README.md#how-the-home-takeover-works).

## 9. Find your remote's HOME key code

If the HOME button doesn't bring you back, your remote likely uses a different
key code than the default `773`. Find yours:

```bash
ssh root@<TV_IP>
cat /dev/input/event*        # press HOME a few times, watch for a repeating code
```

Set the value you observe as `HOME_CODE` in
[`service/service.js`](../service/service.js), then `npm run deploy` again.

## 10. Uninstall / revert

```bash
# remove the boot hook, then the app
ssh root@<TV_IP> "rm -f /var/lib/webosbrew/init.d/49-custom-home"
ares-install --device tv --remove tld.my.customhome
```

Nothing modified the read-only OS, so removing the app and the init.d symlink
fully restores stock behavior. A factory reset is never required.

---

**Stuck?** See [Troubleshooting](../README.md#troubleshooting) in the README, or
open an issue.
