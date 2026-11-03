@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem AeroMatrix Commissioner launcher. The data services live in the sibling folder aeromatrix_main and are started exactly as
rem its RUN_AEROMATRIX.bat does; this app has no backend of its own. Nothing in backend\trained_model or backend\task2_model is changed.

cd /d "%~dp0"
set "APP_DIR=%~dp0"
set "MAIN=%~dp0..\aeromatrix_main"
set "PKG=%MAIN%\backend\trained_model"
set "T2=%MAIN%\backend\task2_model"

set "API_PORT=8000"
if defined AEROMATRIX_PORT set "API_PORT=%AEROMATRIX_PORT%"
set "T2_PORT=8030"
if defined TASK2_PORT set "T2_PORT=%TASK2_PORT%"
set "WEB_PORT=5174"

echo.
echo ================= AeroMatrix Commissioner =================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [Commissioner] Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "%PKG%\bootstrap.py" (
  echo [Commissioner] The model service package was not found at:
  echo     %PKG%\bootstrap.py
  echo [Commissioner] This launcher starts the model API from the sibling aeromatrix_main folder, so it stops here.
  echo [Commissioner] To open the app without it, run:  npm install  then  npm run dev -- --port %WEB_PORT%
  echo [Commissioner] Without it, station readings show as unavailable and live Open-Meteo model data is still used.
  pause
  exit /b 1
)

call :find_python

rem ---------------------------------------------------------------
echo.
echo [Commissioner] Step 1 of 3: model API (port %API_PORT%)
rem ---------------------------------------------------------------
if not defined PY (
  echo [Commissioner] No Python was found, so the model API is skipped. Install 64-bit Python 3.12 from python.org to enable it.
  goto :step2
)
call :port_listening %API_PORT%
if "!LISTENING!"=="1" (
  echo [Commissioner] Port %API_PORT% is already listening: assuming the model API is running there.
  goto :step2
)
echo [Commissioner] Starting the model API in its own window using: !PY!
start "AeroMatrix model API (port %API_PORT%)" /D "%PKG%" cmd /k ""!PY!" bootstrap.py start"

rem ---------------------------------------------------------------
:step2
echo.
echo [Commissioner] Step 2 of 3: Sensor Intelligence (port %T2_PORT%)
rem ---------------------------------------------------------------
if not exist "%T2%\aeromatrix_service.py" (
  echo [Commissioner] Sensor Intelligence package not installed; the app runs without it.
  goto :step3
)
if not defined PY (
  echo [Commissioner] No Python was found, so Sensor Intelligence is skipped.
  goto :step3
)
call :port_listening %T2_PORT%
if "!LISTENING!"=="1" (
  echo [Commissioner] Port %T2_PORT% is already listening: assuming Sensor Intelligence is running there.
  goto :step3
)
if not exist "%T2%\.venv\Scripts\python.exe" (
  echo [Commissioner] Sensor Intelligence has no virtual environment yet. Start it once with aeromatrix_main\RUN_AEROMATRIX.bat; it is skipped here.
  goto :step3
)
echo [Commissioner] Starting Sensor Intelligence in its own window.
start "AeroMatrix Sensor Intelligence (port %T2_PORT%)" /D "%T2%" cmd /k ""%T2%\.venv\Scripts\python.exe" -m uvicorn aeromatrix_service:app --host 127.0.0.1 --port %T2_PORT%"

rem ---------------------------------------------------------------
:step3
echo.
echo [Commissioner] Step 3 of 3: Commissioner app (port %WEB_PORT%)
rem ---------------------------------------------------------------
if not exist "%APP_DIR%node_modules" (
  echo [Commissioner] Installing packages ^(first run only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [Commissioner] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

set "OPEN_URL=http://localhost:%WEB_PORT%"
call :port_listening %WEB_PORT%
if "!LISTENING!"=="1" (
  echo [Commissioner] Port %WEB_PORT% is already listening: assuming the app is running there. Opening %OPEN_URL%
  start "" "%OPEN_URL%"
  exit /b 0
)

echo [Commissioner] Starting the app at %OPEN_URL%
echo [Commissioner] Opening it in your browser in a few seconds. Close the windows to stop everything.
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
if defined AEROMATRIX_PYTHON if exist "%AEROMATRIX_PYTHON%" (
  set "PY=%AEROMATRIX_PYTHON%"
  echo [Commissioner] Python from AEROMATRIX_PYTHON: !PY!
  exit /b 0
)
for /f "usebackq delims=" %%P in (`py -3.12 -c "import sys;print(sys.executable)" 2^>nul`) do set "PY=%%P"
if defined PY (
  echo [Commissioner] Python 3.12 found via the py launcher.
  exit /b 0
)
where uv >nul 2>nul
if not errorlevel 1 (
  for /f "usebackq delims=" %%P in (`uv python find 3.12 2^>nul`) do set "PY=%%P"
  if defined PY (
    echo [Commissioner] Python 3.12 found via uv.
    exit /b 0
  )
)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
  set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  echo [Commissioner] Python 3.12 found in %LOCALAPPDATA%\Programs\Python\Python312.
  exit /b 0
)
where python >nul 2>nul
if not errorlevel 1 (
  for /f "usebackq delims=" %%P in (`python -c "import sys;print(sys.executable)" 2^>nul`) do set "PY=%%P"
  for /f "usebackq delims=" %%V in (`python -c "import sys,struct;print('%%d.%%d (%%d-bit)' %% (sys.version_info[0],sys.version_info[1],struct.calcsize('P')*8))" 2^>nul`) do set "PYV=%%V"
  if defined PY (
    echo [Commissioner] Python 3.12 was not found; falling back to the python on PATH: version !PYV!
    exit /b 0
  )
)
echo [Commissioner] No Python was found. Services that need Python will be skipped.
exit /b 0
