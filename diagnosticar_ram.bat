@echo off
title Diagnostico de RAM NetWatch
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File .\diagnosticar_ram.ps1
pause
