@echo off
title Win NetWatch - Agente Local
echo Iniciando agente local para conexion RDP...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente.ps1"
pause
