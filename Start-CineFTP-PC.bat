@echo off
title CineFTP - PC Server (bondho korle site o bondho)
color 0A
cd /d %~dp0
echo %~dp0 | findstr /I /C:".zip" >nul
if not errorlevel 1 (
  echo.
  echo ============================================================
  echo   BHUL JAYGAY CHALECHO! Zip er VITORE theke chalano jabe na.
  echo   Age zip ta Extract All kore real folder ber koro,
  echo   tarpor oi folder er vitor theke ei file ta chalao.
  echo ============================================================
  echo.
  pause
  exit /b
)
if not exist "%~dp0server.ts" (
  echo.
  echo Ei folder e CineFTP er file nai - vul folder theke chalano hocche.
  echo Extract kora Cine-FTP-Fixed folder er vitor theke chalao.
  echo.
  pause
  exit /b
)
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
echo.
echo Site build hocche (notun version thakle setai ashbe)...
call npm run build
if errorlevel 1 (
  echo.
  echo Build FAIL koreche - uporer error ta dekho. Server chalu hobe na.
  pause
  exit /b
)
echo Purono CineFTP server chalu thakle bondho kore dicchi...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul
timeout /t 1 >nul
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
echo App window ekai khule jabe koyek second er moddhe...
start "" /min cmd /c "timeout /t 12 >nul & (start "" chrome --app=http://localhost:3000 2>nul || start http://localhost:3000)"
call npx tsx server.ts
pause
