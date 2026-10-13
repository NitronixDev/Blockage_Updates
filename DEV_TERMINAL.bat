@echo off
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"
echo Blockage development terminal
echo Node.js 26.11.1 and npm 12.2.0 are available in this terminal.
echo Commands: npm start, npm test, npm run check, npm run doctor
cmd /k
