@echo off
setlocal enabledelayedexpansion
REM webOS Custom Home - one-click installer for Windows 10/11.
REM Just double-click this file. It asks for your TV's IP and installs everything
REM over SSH (ssh + curl ship with Windows 10/11). Your TV must already be ROOTED
REM (Homebrew Channel) with SSH enabled.

set "INSTALLER_URL=https://github.com/zzeppieri/webos-custom-home/releases/download/v0.4.0/tv-install.sh"

echo ==================================================
echo   webOS Custom Home  -  one-click installer (v0.4.0)
echo ==================================================
echo.
echo Before you start, your LG TV must be:
echo   1. ROOTED (Homebrew Channel installed, Root/SSH enabled), and
echo   2. on the same network as this PC.
echo.
set /p "TV_IP=Enter your TV's IP address (e.g. 192.168.1.153): "
if "%TV_IP%"=="" ( echo No IP entered - nothing to do. & pause & exit /b 1 )

echo.
echo Connecting to root@%TV_IP% ...
echo (If asked for a password, it's your TV's root password - often "alpine" unless you changed it.)
echo.

curl -fsSL "%INSTALLER_URL%" | ssh -o StrictHostKeyChecking=accept-new root@%TV_IP% "sh -s"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo All set! Reboot the TV or press HOME on the remote to see your custom home.
) else (
  echo Something went wrong ^(exit code %RC%^). Check the messages above.
  echo Common causes: wrong IP, SSH not enabled, or the TV isn't rooted.
)
echo.
pause
endlocal
