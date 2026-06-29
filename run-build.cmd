@echo off
REM Dash production-build launcher (Windows). See run-dev.cmd for why this
REM wrapper exists. Produces installers under src-tauri\target\release\bundle\.
setlocal
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo [Dash] vswhere not found. Install Visual Studio Build Tools first.
  exit /b 1
)

set "VSPATH="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
if not defined VSPATH (
  echo [Dash] No VS install with the C++ x64 build tools was found.
  exit /b 1
)

echo [Dash] Using MSVC toolchain at: %VSPATH%
call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo [Dash] Failed to initialize the VS C++ environment.
  exit /b 1
)

REM Ensure cargo is on PATH even if this terminal predates the rustup install.
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

npm run tauri:build %*
