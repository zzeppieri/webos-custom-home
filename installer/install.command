#!/bin/bash
# webOS Custom Home — one-click installer for macOS / Linux.
#   • macOS: double-click this file (Finder). If it opens in a text editor instead,
#     right-click → Open, or run:  chmod +x install.command && ./install.command
#   • Linux / Git Bash / WSL:  bash install.command
#
# It asks for your TV's IP and installs everything over SSH. Nothing to build or
# download by hand. Your TV must already be ROOTED (Homebrew Channel) with SSH on.

INSTALLER_URL="https://github.com/zzeppieri/webos-custom-home/releases/download/v0.4.0/tv-install.sh"

echo "=================================================="
echo "  webOS Custom Home  —  one-click installer (v0.4.0)"
echo "=================================================="
echo
echo "Before you start, your LG TV must be:"
echo "  1. ROOTED (Homebrew Channel installed, Root/SSH enabled), and"
echo "  2. on the same network as this computer."
echo
printf "Enter your TV's IP address (e.g. 192.168.1.153): "
read -r TV_IP
if [ -z "$TV_IP" ]; then echo "No IP entered — nothing to do."; exit 1; fi

echo
echo "Connecting to root@${TV_IP} ..."
echo "(If asked for a password, it's your TV's root password — often 'alpine' unless you changed it.)"
echo

curl -fsSL "$INSTALLER_URL" | ssh -o StrictHostKeyChecking=accept-new "root@${TV_IP}" "sh -s"
rc=$?

echo
if [ "$rc" -eq 0 ]; then
  echo "✓ All set! Reboot the TV (or press HOME on the remote) to see your custom home."
else
  echo "✗ Something went wrong (exit code $rc). Check the messages above."
  echo "  Common causes: wrong IP, SSH not enabled, or the TV isn't rooted."
fi
echo
printf "Press Enter to close this window..."
read -r _
