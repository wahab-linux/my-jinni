@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
    echo my-jinni: Electron dependencies are not installed.
    echo Install Node.js 22 or later with npm, then run npm ci in this folder.
    echo Run uv sync to install the Python backend dependencies.
    pause
    exit /b 1
)

set "ELECTRON_RUN_AS_NODE="
"node_modules\electron\dist\electron.exe" "."
set "MY_JINNI_EXIT_CODE=%ERRORLEVEL%"
if not "%MY_JINNI_EXIT_CODE%"=="0" (
    echo my-jinni exited with code %MY_JINNI_EXIT_CODE%.
    pause
)
exit /b %MY_JINNI_EXIT_CODE%
