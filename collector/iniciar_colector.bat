@echo off
title Win NetWatch - Colector de Red
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_colector.ps1"
pause
