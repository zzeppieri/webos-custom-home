# One-click installer

The lazy way to get **webOS Custom Home** onto a rooted LG TV — no building, no
Node, no `ares` CLI. You only need the TV's IP address.

## Before you start

Your TV must already be **rooted** with the [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
and **SSH enabled**. That's the one part nobody can automate for you — see
[`../docs/TUTORIAL.md`](../docs/TUTORIAL.md) sections 1–2 if you haven't done it.
The TV also needs internet access (it downloads the app itself).

## Install

Download the launcher for your OS from the
[**v0.4.0 release**](https://github.com/zzeppieri/webos-custom-home/releases/tag/v0.4.0)
and run it:

| Your computer | File | How to run |
|---|---|---|
| **Windows 10/11** | `install.bat` | Double-click it |
| **macOS** | `install.command` | Double-click (or right-click → Open the first time) |
| **Linux / WSL / Git Bash** | `install.command` | `bash install.command` |

It asks for your TV's IP, then does everything over SSH: installs the app,
enables boot autostart + the HOME-button takeover, and launches it. If SSH asks
for a password, it's your TV's **root** password (often `alpine` unless you
changed it).

### Prefer a one-liner?

If you already live in a terminal, skip the launchers entirely:

```sh
ssh root@<TV_IP> "curl -fsSL https://github.com/zzeppieri/webos-custom-home/releases/download/v0.4.0/tv-install.sh | sh"
```

## Uninstall

```sh
ssh root@<TV_IP> "curl -fsSL https://github.com/zzeppieri/webos-custom-home/releases/download/v0.4.0/tv-uninstall.sh | sh"
```

Nothing here touches the read-only OS, so uninstalling fully restores stock
behavior — no factory reset needed.

## How it works

`tv-install.sh` runs *on the TV* and installs straight from the release's `.ipk`
asset using the Homebrew Channel's own install service (verified against the
ipk's SHA-256), then symlinks `autostart.sh` into `webosbrew`'s `init.d` for boot
persistence. The desktop launchers are thin wrappers that pipe `tv-install.sh`
into the TV's shell over SSH.

To **customize** apps, weather, and icons, you still want the full developer flow
in [`../docs/TUTORIAL.md`](../docs/TUTORIAL.md) (clone → edit → `npm run deploy`).
The one-click installer gives you the stock layout.
