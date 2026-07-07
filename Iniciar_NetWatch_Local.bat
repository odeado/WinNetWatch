@echo off
title Iniciar Win NetWatch Local
echo =======================================================
echo           INICIANDO WIN NETWATCH LOCAL
echo =======================================================
echo.

:: 1. Verificar si Docker está corriendo
echo [+] Verificando estado de Docker...
powershell -Command "$p = Start-Process docker -ArgumentList info -NoNewWindow -PassThru; if (-not $p.WaitForExit(5000)) { $p.Kill(); exit 1 } else { exit $p.ExitCode }" >nul 2>&1
if %errorlevel% equ 0 goto docker_ok

echo [!] Docker Desktop no esta iniciado. Iniciandolo...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" --minimized

echo [+] Esperando a que el motor de Docker responda...
:wait_docker
ping 127.0.0.1 -n 4 >nul
powershell -Command "$p = Start-Process docker -ArgumentList info -NoNewWindow -PassThru; if (-not $p.WaitForExit(5000)) { $p.Kill(); exit 1 } else { exit $p.ExitCode }" >nul 2>&1
if %errorlevel% neq 0 (
    echo     . (aun conectando...)
    goto wait_docker
)

:docker_ok
echo [+] ¡Docker esta listo!

:: 2. Detener el contenedor API de Docker por si acaso (para liberar puerto 8080)
echo [+] Liberando puerto 8080 en Docker...
docker-compose stop api >nul 2>&1

:: Liberar puerto 8080 en Windows (por si quedo un proceso Node local del backend colgado)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do (
    echo [+] Liberando puerto 8080 ocupado por PID %%a en Windows...
    taskkill /f /pid %%a >nul 2>&1
)

:: 3. Levantar la base de datos (Postgres) y el Frontend (sin levantar la API de Docker)
echo [+] Levantando Base de Datos y Frontend en Docker...
docker-compose up -d postgres
docker-compose up -d --no-deps frontend
docker-compose stop api >nul 2>&1

:: 4. Ejecutar el backend local en segundo plano (oculto)
echo [+] Iniciando Backend en segundo plano (red local / VPN)...
start "" /min powershell -WindowStyle Hidden -Command "Set-Location -LiteralPath '%~dp0backend'; npm run dev"

:: 5. Esperar 3 segundos para dar tiempo a inicializar y abrir la web
ping 127.0.0.1 -n 4 >nul
echo [+] Abriendo navegador en http://localhost:3000...
start http://localhost:3000

echo.
echo =======================================================
echo ¡Listo! El backend se inicio en segundo plano oculto.
echo =======================================================
