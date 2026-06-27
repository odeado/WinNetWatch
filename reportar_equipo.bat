@echo off
title NetWatch - Reportar Hardware
cd /d "%~dp0"

:: Detectar si el archivo es reportar_equipo.ps1 o reportar_equipo_2.0.ps1
set SCRIPT_NAME=reportar_equipo.ps1
if exist "reportar_equipo_2.0.ps1" (
    set SCRIPT_NAME=reportar_equipo_2.0.ps1
)

if not exist "%SCRIPT_NAME%" (
    echo [ERROR] No se encontro el archivo script de PowerShell ^(%SCRIPT_NAME%^) en esta carpeta.
    echo Asegurate de copiar tanto el archivo .bat como el archivo .ps1 al Escritorio.
    echo.
    pause
    exit /b 1
)

echo ====================================================
echo   Enviando inventario a http://172.30.102.171:8080
echo   Ejecutando: %SCRIPT_NAME%
echo ====================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_NAME%" -ServerUrl "http://172.30.102.171:8080"
pause
