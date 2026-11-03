@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem AeroMatrix launcher: starts every service that is installed and skips the rest with a message.
rem backend\trained_model and backend\task2_model belong to the training machine. This file only reads and launches them.

cd /d "%~dp0"
set "APP_DIR=%~dp0"
set "PKG=%APP_DIR%backend\trained_model"
set "T2=%APP_DIR%backend\task2_model"
set "CHAT=%APP_DIR%backend\chatbot"
set "LANDING=%APP_DIR%landing"

set "API_PORT=8000"
if defined AEROMATRIX_PORT set "API_PORT=%AEROMATRIX_PORT%"
set "CHAT_PORT=8010"
if defined CHATBOT_PORT set "CHAT_PORT=%CHATBOT_PORT%"
set "T2_PORT=8030"
if defined TASK2_PORT set "T2_PORT=%TASK2_PORT%"
set "LANDING_PORT=3000"
set "WEB_PORT=5173"

echo.
echo ===================== AeroMatrix =====================
echo The first run downloads about 1 GB of packages and can take 15-30 minutes.
echo Later runs start in about a minute and work offline, except live air quality.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [AeroMatrix] Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

call :find_python

rem ---------------------------------------------------------------
echo.
echo [AeroMatrix] Step 1 of 5: model API (port %API_PORT%)
rem ---------------------------------------------------------------
if not exist "%PKG%\bootstrap.py" (
  echo [AeroMatrix] Model service package not installed yet; the app will run without station forecasts.
  goto :step2
)
if not defined PY (
  echo [AeroMatrix] No Python was found, so the model service is skipped. Install 64-bit Python 3.12 from python.org to enable station forecasts.
  goto :step2
)
call :port_listening %API_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] Port %API_PORT% is already listening: assuming the model API is running there.
  goto :step2
)
echo [AeroMatrix] Starting the model API in its own window using: !PY!
echo [AeroMatrix] The first run creates its own virtual environment and downloads pinned packages. It never retrains.
start "AeroMatrix model API (port %API_PORT%)" /D "%PKG%" cmd /k ""!PY!" bootstrap.py start"

rem ---------------------------------------------------------------
:step2
echo.
echo [AeroMatrix] Step 2 of 5: AeroSage assistant (port %CHAT_PORT%)
rem ---------------------------------------------------------------
if not exist "%CHAT%\requirements.txt" (
  echo [AeroMatrix] The AeroSage backend folder is missing; the chat button will say it is not running.
  goto :step3
)
if not defined PY (
  echo [AeroMatrix] No Python was found, so AeroSage is skipped. Install 64-bit Python 3.12 from python.org to enable it.
  goto :step3
)
call :port_listening %CHAT_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] Port %CHAT_PORT% is already listening: assuming AeroSage is running there.
  goto :step3
)
if not exist "%CHAT%\.venv\Scripts\python.exe" (
  echo [AeroMatrix] Setting up AeroSage once ^(virtual environment, packages, knowledge index^)...
  call "%CHAT%\SETUP_CHATBOT.bat"
  if errorlevel 1 (
    echo [AeroMatrix] AeroSage setup failed, so it is skipped. The rest of the app still works.
    goto :step3
  )
)
echo [AeroMatrix] Starting AeroSage in its own window.
start "AeroSage (port %CHAT_PORT%)" /D "%CHAT%" cmd /k "START_CHATBOT.bat"

rem ---------------------------------------------------------------
:step3
echo.
echo [AeroMatrix] Step 3 of 5: Sensor Intelligence (port %T2_PORT%)
rem ---------------------------------------------------------------
if not exist "%T2%\aeromatrix_service.py" (
  echo [AeroMatrix] Sensor Intelligence package not installed yet; the Sensors screen will say the service is offline.
  goto :step4
)
if not defined PY (
  echo [AeroMatrix] No Python was found, so Sensor Intelligence is skipped.
  goto :step4
)
call :port_listening %T2_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] Port %T2_PORT% is already listening: assuming Sensor Intelligence is running there.
  goto :step4
)
if not exist "%T2%\.venv\Scripts\python.exe" (
  if not exist "%T2%\requirements.txt" (
    echo [AeroMatrix] backend\task2_model has no requirements.txt, so Sensor Intelligence is skipped.
    goto :step4
  )
  echo [AeroMatrix] Creating the Sensor Intelligence virtual environment once from its pinned requirements...
  "!PY!" -m venv "%T2%\.venv"
  if errorlevel 1 (
    echo [AeroMatrix] Could not create the virtual environment, so Sensor Intelligence is skipped.
    goto :step4
  )
  "%T2%\.venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "%T2%\requirements.txt"
  if errorlevel 1 (
    echo [AeroMatrix] Package install failed, so Sensor Intelligence is skipped. Check your internet connection and run again.
    goto :step4
  )
)
"%T2%\.venv\Scripts\python.exe" -c "import sklearn, pandas, fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo [AeroMatrix] The Sensor Intelligence environment is missing sklearn, pandas, fastapi or uvicorn, so it is skipped.
  echo [AeroMatrix] Delete backend\task2_model\.venv and run this file again to rebuild it.
  goto :step4
)
echo [AeroMatrix] Starting Sensor Intelligence in its own window.
start "AeroMatrix Sensor Intelligence (port %T2_PORT%)" /D "%T2%" cmd /k ""%T2%\.venv\Scripts\python.exe" -m uvicorn aeromatrix_service:app --host 127.0.0.1 --port %T2_PORT%"

rem ---------------------------------------------------------------
:step4
echo.
echo [AeroMatrix] Step 4 of 5: landing page (port %LANDING_PORT%)
rem ---------------------------------------------------------------
set "OPEN_URL=http://localhost:%WEB_PORT%"
if not exist "%LANDING%\package.json" (
  echo [AeroMatrix] The landing folder is missing; opening the web app directly.
  goto :step5
)
set "OPEN_URL=http://localhost:%LANDING_PORT%"
call :port_listening %LANDING_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] Port %LANDING_PORT% is already listening: assuming the landing page is running there.
  goto :step5
)
if not exist "%LANDING%\node_modules" (
  echo [AeroMatrix] Installing landing page packages ^(first run only^)...
  pushd "%LANDING%"
  call npm install --no-audit --no-fund
  set "NPM_ERR=!errorlevel!"
  popd
  if not "!NPM_ERR!"=="0" (
    echo [AeroMatrix] Landing page install failed; opening the web app directly.
    set "OPEN_URL=http://localhost:%WEB_PORT%"
    goto :step5
  )
)
echo [AeroMatrix] Starting the landing page in its own window.
start "AeroMatrix landing (port %LANDING_PORT%)" /D "%LANDING%" cmd /k "npm run dev"

rem ---------------------------------------------------------------
:step5
echo.
echo [AeroMatrix] Step 5 of 5: web app (port %WEB_PORT%)
rem ---------------------------------------------------------------
if not exist "%APP_DIR%node_modules" (
  echo [AeroMatrix] Installing web app packages ^(first run only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [AeroMatrix] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

call :port_listening %WEB_PORT%
if "!LISTENING!"=="1" (
  echo [AeroMatrix] Port %WEB_PORT% is already listening: assuming the web app is running there. Opening %OPEN_URL%
  start "" "%OPEN_URL%"
  exit /b 0
)

echo [AeroMatrix] Starting the web app at http://localhost:%WEB_PORT%
echo [AeroMatrix] Opening %OPEN_URL% in your browser in a few seconds. Close the windows to stop everything.
start "" /b cmd /c "timeout /t 9 >nul & start "" %OPEN_URL%"
call npm run dev -- --port %WEB_PORT% --strictPort
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
    exit /b 0
  )
)
echo [AeroMatrix] No Python was found. Services that need Python will be skipped.
exit /b 0
