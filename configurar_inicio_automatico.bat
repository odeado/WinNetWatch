@echo off
title Configurar Inicio Automatico - Win NetWatch Agente
echo.
echo =======================================================
echo   Configurar Inicio Automatico del Agente Win NetWatch
echo =======================================================
echo.
echo Este script configurara el agente local para que se ejecute
echo automaticamente en segundo plano al iniciar sesion en Windows.
echo.
set /p confirmar="¿Desea configurar el inicio automatico? (S/N): "
if /i "%confirmar%" neq "S" goto cancelado

:: Create a VBS script to run the batch file hidden in the background
set "vbsPath=%TEMP%\netwatch_agent_hidden.vbs"
echo CreateObject("Wscript.Shell").Run """%~dp0iniciar_agente.bat""", 0, False > "%vbsPath%"

:: Copy VBS shortcut to Windows Startup folder
set "startupFolder=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /y "%vbsPath%" "%startupFolder%\netwatch_agent.vbs" >nul
del "%vbsPath%"

echo.
echo ¡Configurado con exito! El agente se ejecutara en segundo plano
echo cada vez que inicies sesion en Windows.
echo.
pause
exit

:cancelado
echo.
echo Operacion cancelada.
echo.
pause
