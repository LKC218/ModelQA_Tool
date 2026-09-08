@echo off
setlocal

cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Install Node.js LTS and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] node_modules was not found. Run npm install in this folder first.
  pause
  exit /b 1
)

echo Starting Model Review Tool developer server...
call npm run dev -- --host 127.0.0.1 --open

echo.
echo Local server has stopped.
pause
