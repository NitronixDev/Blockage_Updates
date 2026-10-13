@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"
call "%~dp0runtime\node\npm.cmd" run start:compat
if errorlevel 1 pause
