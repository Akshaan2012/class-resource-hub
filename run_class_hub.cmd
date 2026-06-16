@echo off
setlocal
cd /d "%~dp0"
if "%CLASS_CODE%"=="" set CLASS_CODE=GENWISE
if "%HOST%"=="" set HOST=127.0.0.1
if "%PORT%"=="" set PORT=4173

set CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" server.js
) else (
  node server.js
)
