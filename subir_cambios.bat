@echo off
title Subir Cambios a GitHub (Win NetWatch)
echo.
echo ======================================================
echo   SUBIR CAMBIOS AUTOMATICAMENTE A GITHUB
echo ======================================================
echo.

:: Detect git executable
set GIT_CMD=git
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set GIT_CMD="C:\Program Files\Git\cmd\git.exe"
    ) else if exist "C:\Program Files\Git\bin\git.exe" (
        set GIT_CMD="C:\Program Files\Git\bin\git.exe"
    ) else if exist "%LocalAppData%\Programs\Git\cmd\git.exe" (
        set GIT_CMD="%LocalAppData%\Programs\Git\cmd\git.exe"
    ) else (
        echo [x] Error: No se encontro Git instalado en el sistema.
        echo [i] Por favor, instala Git o agregalo al PATH del sistema.
        pause
        exit /b 1
    )
)

:: Ask for commit message
set /p msg="Introduce una descripcion de los cambios (o pulsa Enter para usar 'Actualizacion de codigo'): "
if "%msg%"=="" set msg=Actualizacion de codigo

echo.
echo [+] Ejecutando: git add .
%GIT_CMD% add .

echo [+] Ejecutando: git commit -m "%msg%"
%GIT_CMD% commit -m "%msg%"

echo [+] Ejecutando: git push origin main
%GIT_CMD% push origin main

echo.
if %errorlevel% neq 0 (
    echo [x] Ocurrio un error al subir los cambios.
    echo [i] Si hay conflictos o es la primera vez, puedes probar a ejecutar 'git push origin main --force' en la terminal.
) else (
    echo [!] Cambios subidos correctamente. Vercel comenzara el despliegue de inmediato.
)
echo.
pause
