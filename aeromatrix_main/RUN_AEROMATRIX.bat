@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem AeroMatrix launcher (V3): optional model API + the web app.
rem This file only reads and launches backend\trained_model; it never writes into it and never retrains.

cd /d "%~dp0"
set "APP_DIR=%~dp0"
set "PKG=%APP_DIR%backend\trained_model"
set "API_PORT=8000"
set "WEB_PORT=5173"

echo.
echo ================= AeroMatrix =================

rem ---------------------------------------------------------------
rem 1) Model service (optional)
rem ---------------------------------------------------------------
if not exist "%PKG%\bootstrap.py" (
  echo [AeroMatrix] Model service package not installed yet; the app will run without station forecasts.
  goto :web
)

call :find_python
if not defined PY (
  echo [AeroMatrix] No Python was found, so the model service is skipped. Install 64-bit Python 3.12 from python.org to enable station forecasts.
  goto :web
)

call :port_listening %API_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] Port %API_PORT% is already listening: assuming the model API is running. Skipping start.
  goto :web
)

echo [AeroMatrix] Starting the model API in its own window using: !PY!
echo [AeroMatrix] The first run creates its own virtual environment and downloads pinned packages. This can take a few minutes. Later runs start quickly.
start "AeroMatrix model API (port %API_PORT%)" /D "%PKG%" cmd /k ""!PY!" bootstrap.py start"

rem ---------------------------------------------------------------
rem 2) Web app
rem ---------------------------------------------------------------
:web
where node >nul 2>nul
if errorlevel 1 (
  echo [AeroMatrix] Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "%APP_DIR%node_modules" (
  echo [AeroMatrix] Installing web app packages ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo [AeroMatrix] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

call :port_listening %WEB_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] The web app is already running on port %WEB_PORT%. Opening it.
  start "" "http://localhost:%WEB_PORT%"
  exit /b 0
)

echo [AeroMatrix] Starting the web app. It opens at http://localhost:%WEB_PORT%
start "" /b cmd /c "timeout /t 7 >nul & start "" http://localhost:%WEB_PORT%"
call npm run dev
exit /b %errorlevel%

rem ---------------------------------------------------------------
rem Helpers
rem ---------------------------------------------------------------
:port_listening
set "LISTENING=0"
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul 2>nul
if not errorlevel 1 set "LISTENING=1"
exit /b 0

:find_python
set "PY="
rem AEROMATRIX_PYTHON wins when set.
if defined AEROMATRIX_PYTHON if exist "%AEROMATRIX_PYTHON%" (
  set "PY=%AEROMATRIX_PYTHON%"
  echo [AeroMatrix] Python from AEROMATRIX_PYTHON: !PY!
  exit /b 0
)
rem The Windows launcher, 3.12 first.
for /f "usebackq delims=" %%P in (`py -3.12 -c "import sys;print(sys.executable)" 2^>nul`) do set "PY=%%P"
if defined PY (
  echo [AeroMatrix] Python 3.12 found via the py launcher.
  exit /b 0
)
rem uv, if installed.
where uv >nul 2>nul
if not errorlevel 1 (
  for /f "usebackq delims=" %%P in (`uv python find 3.12 2^>nul`) do set "PY=%%P"
  if defined PY (
    echo [AeroMatrix] Python 3.12 found via uv.
    exit /b 0
  )
)
rem Default per-user install location.
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
  set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  echo [AeroMatrix] Python 3.12 found in %LOCALAPPDATA%\Programs\Python\Python312.
  exit /b 0
)
rem Fall back to whatever python is on PATH, and say which version it is.
where python >nul 2>nul
if not errorlevel 1 (
  for /f "usebackq delims=" %%P in (`python -c "import sys;print(sys.executable)" 2^>nul`) do set "PY=%%P"
  for /f "usebackq delims=" %%V in (`python -c "import sys,struct;print('%%d.%%d (%%d-bit)' %% (sys.version_info[0],sys.version_info[1],struct.calcsize('P')*8))" 2^>nul`) do set "PYV=%%V"
  if defined PY (
    echo [AeroMatrix] Python 3.12 was not found; falling back to the python on PATH: version !PYV!
    echo [AeroMatrix] The model service was tested on 3.12 and on a 3.13 virtual environment with the pinned requirements.
    exit /b 0
  )
)
exit /b 0
