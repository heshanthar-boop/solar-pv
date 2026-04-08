@echo off
setlocal
REM SolarPV Field Tool launcher
REM Starts a local web server and opens the app in Brave app mode.

set "PORT=8090"
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

REM Kill any existing listener on the same port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

REM Start server in background from this repo directory
start "" /min cmd /c "py -m http.server %PORT% --directory \"%APP_DIR%\""

REM Wait for server to start
timeout /t 2 /nobreak >nul

REM Open in Brave as app window
start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --app=http://localhost:%PORT%
