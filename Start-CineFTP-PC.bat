@echo off
title CineFTP - PC Server (bondho korle site o bondho)
color 0A
cd /d %~dp0
echo ================================================
echo   CineFTP PC Server chalu hocche...
echo ================================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js pawa jay nai! Age nodejs.org theke Node.js LTS install koro.
  echo.
  pause
  exit /b
)
if not exist node_modules (
  echo.
  echo Prothom bar: package install hocche, 2-3 minute lagte pare...
  call npm install --legacy-peer-deps
)
if not exist dist (
  echo.
  echo Site build hocche...
  call npm run build
)
set PORT=3000
set NODE_ENV=production
echo.
echo ================================================
echo   HOYE GECHE! Browser e khulo:
echo.
echo   Ei PC te:      http://localhost:3000
echo.
echo   Phone / TV / onno device e (ekoi WiFi):
echo   nicher IPv4 address tar pore :3000 bosa o
ipconfig | findstr /C:"IPv4"
echo   Example:       http://192.168.1.105:3000
echo ================================================
echo.
echo Ei window ta KHOLA rakhba - bondho korle site bondho hoye jabe.
echo Windows Firewall jodi jante chay, "Allow" dio.
echo.
call npx tsx server.ts
pause
