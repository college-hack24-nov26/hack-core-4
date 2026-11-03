@echo off
setlocal EnableExtensions
rem Starts AeroSage on port 8010 (or CHATBOT_PORT from .env).
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [AeroSage] First run: setting up...
  call SETUP_CHATBOT.bat
  if errorlevel 1 exit /b 1
)
if not exist "rag\knowledge_index\kb.sqlite3" (
  ".venv\Scripts\python.exe" -m rag.build_index
)

set "PORT=8010"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"CHATBOT_PORT=" .env 2^>nul') do if not "%%B"=="" set "PORT=%%B"
if defined CHATBOT_PORT set "PORT=%CHATBOT_PORT%"

echo [AeroSage] http://127.0.0.1:%PORT%  (Ctrl+C to stop)
".venv\Scripts\python.exe" -m uvicorn chatbot.main:app --host 127.0.0.1 --port %PORT%
