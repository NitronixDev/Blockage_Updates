@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"
if not exist "%~dp0runtime\node\node.exe" goto missing
if not exist "%~dp0node_modules\electron\dist\electron.exe" goto missing
call "%~dp0runtime\node\npm.cmd" start
if errorlevel 1 goto failed
exit /b 0
:missing
echo Please extract the WHOLE Blockage ZIP to a folder before starting.
echo This package is for Windows 10/11 x64.
echo If dependencies were removed, run INSTALL_DEPENDENCIES.bat.
pause
exit /b 1
:failed
echo.
echo Blockage could not start. Try START_BLOCKAGE_COMPAT.bat.
pause
exit /b 1
