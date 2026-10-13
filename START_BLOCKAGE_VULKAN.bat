@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"
echo Starting Blockage with the experimental Vulkan graphics profile.
echo The actual WebGPU backend depends on Chromium, the OS, and your driver.
call "%~dp0runtime\node\npm.cmd" run start:vulkan
if errorlevel 1 (
  echo Vulkan startup failed. Use START_BLOCKAGE.bat or START_BLOCKAGE_COMPAT.bat.
  pause
)
