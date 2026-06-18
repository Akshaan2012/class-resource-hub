@echo off
setlocal
cd /d "%~dp0"
set HOST=127.0.0.1
set PORT=4174
if "%CLASS_CODE%"=="" set CLASS_CODE=GENWISE

set CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" server.js
) else (
  echo Node.js is required. Install it from https://nodejs.org/
  pause
)
