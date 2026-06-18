@echo off
title Subir Cambios a GitHub (Win NetWatch)
echo.
echo ======================================================
echo   SUBIR CAMBIOS AUTOMATICAMENTE A GITHUB
echo ======================================================
echo.

:: Ask for commit message
set /p msg="Introduce una descripcion de los cambios (o pulsa Enter para usar 'Actualizacion de codigo'): "
if "%msg%"=="" set msg=Actualizacion de codigo

echo.
echo [+] Ejecutando: git add .
git add .

echo [+] Ejecutando: git commit -m "%msg%"
git commit -m "%msg%"

echo [+] Ejecutando: git push origin main
git push origin main

echo.
if %errorlevel% neq 0 (
    echo [x] Ocurrio un error al subir los cambios.
    echo [i] Si hay conflictos o es la primera vez, puedes probar a ejecutar 'git push origin main --force' en la terminal.
) else (
    echo [!] Cambios subidos correctamente. Vercel comenzara el despliegue de inmediato.
)
echo.
pause
