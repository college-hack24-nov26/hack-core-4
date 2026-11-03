@echo off
setlocal EnableExtensions
rem Creates the chatbot virtual environment, installs pinned packages and builds the knowledge index.
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && (py -3.12 -c "import sys" >nul 2>nul && set "PY=py -3.12")
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo [AeroSage] Python was not found. Install 64-bit Python 3.12 from python.org and run this again.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [AeroSage] Creating the virtual environment...
  %PY% -m venv .venv
  if errorlevel 1 ( echo [AeroSage] Could not create the virtual environment. & exit /b 1 )
)

echo [AeroSage] Installing packages...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 ( echo [AeroSage] Package install failed. Check your internet connection. & exit /b 1 )

echo [AeroSage] Building the knowledge index...
".venv\Scripts\python.exe" -m rag.build_index
if errorlevel 1 ( echo [AeroSage] Index build failed. & exit /b 1 )

echo [AeroSage] Setup complete.
exit /b 0
