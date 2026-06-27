@echo off
title NetWatch - Importador Directo a la Nube
cd /d "%~dp0"

echo ====================================================
echo   IMPORTANDO FICHAS DIRECTAMENTE A FIREBASE (NUBE)
echo ====================================================
echo.

node importar_fichas_cloud.mjs
echo.
pause
