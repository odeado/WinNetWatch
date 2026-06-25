@echo off
title Configurar Servicio de Colector - Win NetWatch
cd /d "%~dp0"
echo.
echo ========================================================
echo   Configurar Inicio Automático del Colector Win NetWatch
echo ========================================================
echo.
echo Este script configurará el colector autónomo para que se ejecute
echo automáticamente en segundo plano (oculto) cada vez que inicies sesión.
echo.
set /p confirmar="¿Desea configurar el inicio automático? (S/N): "
if /i "%confirmar%" neq "S" goto cancelado

:: Crear el script VBScript para ejecutar el colector de forma oculta en segundo plano
set "vbsPath=%~dp0colector_oculto.vbs"
echo CreateObject("Wscript.Shell").Run """%~dp0iniciar_colector.bat""", 0, False > "%vbsPath%"

:: Registrar una Tarea Programada en Windows para arrancar el VBScript al iniciar sesión
schtasks /create /tn "WinNetWatchCollector" /tr "wscript.exe \"%vbsPath%\"" /sc onlogon /f

echo.
echo ¡Configurado con éxito! El colector se iniciará y ejecutará en segundo plano
echo (oculto) cada vez que inicies sesión en Windows.
echo Puedes comprobar que esté corriendo buscando el proceso "node" en el Administrador de Tareas.
echo.
pause
exit

:cancelado
echo.
echo Operación cancelada.
echo.
pause
