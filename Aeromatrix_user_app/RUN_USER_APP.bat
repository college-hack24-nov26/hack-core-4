@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem AeroMatrix For Users launcher: starts the user service (complaints and devices, port 8040) when Python is available,
rem then the app on port 5176. Nothing in aeromatrix_main\backend\trained_model or task2_model is touched.

cd /d "%~dp0"
set "SERVICE=%~dp0..\aeromatrix_main\backend\userservice"
set "WEB_PORT=5176"

where node >nul 2>nul
if errorlevel 1 (
  echo [Users] Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo [Users] No Python was found, so the user service is skipped: complaints will be saved on the phone, not sent.
) else if exist "%SERVICE%\app.py" (
  netstat -ano | findstr /R /C:":8040 .*LISTENING" >nul 2>nul
  if errorlevel 1 (
    echo [Users] Starting the user service in its own window ^(port 8040^).
    start "AeroMatrix user service (port 8040)" /D "%SERVICE%" cmd /k "python -m uvicorn app:app --host 127.0.0.1 --port 8040"
  ) else (
    echo [Users] Port 8040 is already listening: assuming the user service is running.
  )
)

if not exist "%~dp0node_modules" (
  echo [Users] Installing packages ^(first run only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [Users] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo [Users] Starting the app at http://localhost:%WEB_PORT%
start "" /b cmd /c "timeout /t 9 >nul & start "" http://localhost:%WEB_PORT%"
call npm run dev -- --port %WEB_PORT% --strictPort
exit /b %errorlevel%
