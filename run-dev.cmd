@echo off
REM ---------------------------------------------------------------------------
REM Dash dev launcher (Windows)
REM
REM Rust on Windows links via MSVC's link.exe and needs that toolset's x64 CRT
REM libraries (msvcrt.lib etc.). If the newest installed Visual Studio is missing
REM the "Desktop development with C++" components, a plain `npm run tauri:dev`
REM fails with: LINK : fatal error LNK1104: cannot open file "msvcrt.lib".
REM
REM This script asks vswhere for the newest VS install that actually HAS the
REM C++ x64 build tools, loads its environment (LIB/INCLUDE/PATH), then runs the
REM app. Use this instead of `npm run tauri:dev` on Windows.
REM ---------------------------------------------------------------------------
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
  echo        Open the Visual Studio Installer and add the
  echo        "Desktop development with C++" workload, then retry.
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

npm run tauri:dev %*
