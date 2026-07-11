@echo off
title Respaldar Win NetWatch
echo =======================================================
echo            RESPALDAR SISTEMA WIN NETWATCH
echo =======================================================
echo.
echo Este script creara un respaldo de la base de datos de NetWatch.
echo.

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
for /f "tokens=2 delims==" %%A in ('findstr "POSTGRES_DB=" .env') do set POSTGRES_DB=%%A
for /f "tokens=2 delims==" %%A in ('findstr "POSTGRES_USER=" .env') do set POSTGRES_USER=%%A
:config_done

echo [+] Generando copia de seguridad de la base de datos...
docker compose exec -T postgres pg_dump -U %POSTGRES_USER% -d %POSTGRES_DB% > backup_netwatch.sql

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ocurrio un problema al respaldar la base de datos.
    echo Asegurate de que los contenedores esten corriendo mediante Iniciar_NetWatch_Local.bat.
    echo.
    pause
    exit /b
)

echo.
echo =======================================================
echo [!] ¡Respaldo completado con exito!
echo =======================================================
echo.
echo Se ha generado el archivo:
echo   - backup_netwatch.sql (Base de datos)
echo.
echo Pasos para llevar el sistema a otro equipo:
echo.
echo 1. Copia toda esta carpeta (incluyendo backup_netwatch.sql y .env)
echo    al nuevo servidor/equipo.
echo    Nota: Puedes omitir la carpeta 'node_modules' para ahorrar espacio.
echo.
echo 2. En el nuevo equipo, asegúrate de tener Docker instalado y ejecutándose.
echo.
echo 3. Abre la carpeta en el nuevo equipo y ejecuta:
echo    - Iniciar_NetWatch_Local.bat (para levantar el backend y frontend)
echo.
echo 4. Ejecuta el script "restaurar.bat" en el nuevo equipo para importar
echo    todos los datos respaldados en 'backup_netwatch.sql'.
echo.
pause
