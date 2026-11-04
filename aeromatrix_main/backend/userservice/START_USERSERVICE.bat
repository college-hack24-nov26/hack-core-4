@echo off
rem Starts the AeroMatrix user service on port 8040 (complaints and devices).
cd /d "%~dp0"
python -m uvicorn app:app --host 127.0.0.1 --port 8040
