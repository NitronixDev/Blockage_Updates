@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"
echo Restoring the exact dependencies from package-lock.json.
echo This repair command requires an Internet connection.
call "%~dp0runtime\node\npm.cmd" ci --no-audit --no-fund
if errorlevel 1 (
  echo Dependency installation failed. Check the messages above.
) else (
  echo Dependencies restored. Run START_BLOCKAGE.bat.
)
pause
