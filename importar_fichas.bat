@echo off
title NetWatch - Importador Masivo de Fichas
cd /d "%~dp0"

if not exist "importar_fichas.ps1" (
    echo [ERROR] No se encontro el archivo 'importar_fichas.ps1' en esta carpeta.
    echo Asegurate de ejecutar este .bat en la misma carpeta donde esta el script de PowerShell.
    echo.
    pause
    exit /b 1
)

echo ====================================================
echo   Importando fichas JSON a http://172.30.102.171:8080
echo ====================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "importar_fichas.ps1" -ServerUrl "http://172.30.102.171:8080"
pause
