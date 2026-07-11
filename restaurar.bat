@echo off
title Restaurar Win NetWatch
echo =======================================================
echo            RESTAURAR SISTEMA WIN NETWATCH
echo =======================================================
echo.
echo Este script importara el respaldo de la base de datos a Docker.
echo.

if not exist backup_netwatch.sql (
    echo [ERROR] No se encontro el archivo 'backup_netwatch.sql'.
    echo Asegurate de que el archivo este en la misma carpeta que este script.
    echo.
    pause
    exit /b
)

:: Verificar si Docker está corriendo
echo [+] Verificando si Docker esta en ejecucion...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker no esta corriendo. Por favor inicia Docker Desktop y reintenta.
    echo.
    pause
    exit /b
)

:: Obtener variables desde el archivo .env o usar valores por defecto
set POSTGRES_DB=win_netwatch
set POSTGRES_USER=netwatch

if not exist .env goto config_done
for /f "tokens=1* delims==" %%i in (.env) do (
    if "%%i"=="POSTGRES_DB" set POSTGRES_DB=%%j
    if "%%i"=="POSTGRES_USER" set POSTGRES_USER=%%j
)
:config_done

:: Verificar si el contenedor postgres está corriendo
docker compose ps postgres | findstr /i "Up" >nul
if %errorlevel% neq 0 (
    echo [+] Iniciando el contenedor de base de datos...
    docker compose up -d postgres
    echo [+] Esperando a que el motor de base de datos responda...
    ping 127.0.0.1 -n 5 >nul
)

echo [+] Restaurando la base de datos desde backup_netwatch.sql...
docker compose exec -T postgres psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >nul 2>&1
docker compose exec -T postgres psql -U %POSTGRES_USER% -d %POSTGRES_DB% < backup_netwatch.sql

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ocurrio un problema al restaurar la base de datos.
    echo.
    pause
    exit /b
)

echo.
echo =======================================================
echo [!] ¡Restauracion completada con exito!
echo =======================================================
echo.
echo La base de datos ha sido importada correctamente.
echo Ahora puedes iniciar/reiniciar el sistema ejecutando:
echo   - Iniciar_NetWatch_Local.bat
echo.
pause
