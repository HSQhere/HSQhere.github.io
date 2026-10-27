@echo off
REM ---------------------------------------------------------------
REM  New blog post helper.
REM  Pure ASCII on purpose: cmd's default codepage mangles UTF-8
REM  bytes in .bat files. All Chinese text lives in
REM  scripts\new-post.ps1, which is UTF-8 with BOM.
REM ---------------------------------------------------------------

chcp 65001 >nul 2>&1
setlocal

cd /d "%~dp0"

if not exist "scripts\new-post.ps1" (
    echo.
    echo   [ERROR] scripts\new-post.ps1 not found.
    echo   Keep this .bat in the repository root next to package.json.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\new-post.ps1"
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" echo   exited with code %RC%
pause
exit /b %RC%
