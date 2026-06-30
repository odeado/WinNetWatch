@echo off
title Iniciar Win NetWatch Local
echo =======================================================
echo           INICIANDO WIN NETWATCH LOCAL
echo =======================================================
echo.

:: 1. Detener el contenedor API de Docker por si acaso (para liberar puerto 8080)
echo [+] Liberando puerto 8080 en Docker...
docker-compose stop api >nul 2>&1

:: 2. Levantar la base de datos (Postgres) y el Frontend en Docker
echo [+] Levantando Base de Datos y Frontend en Docker...
docker-compose up -d postgres frontend

:: 3. Abrir y ejecutar el backend local en una nueva ventana
echo [+] Iniciando Backend en red local (VPN)...
start cmd /k "cd /d %~dp0backend && title Backend NetWatch Local && npm run dev"

:: 4. Esperar 3 segundos para dar tiempo a inicializar y abrir la web
timeout /t 3 /nobreak >nul
echo [+] Abriendo navegador en http://localhost:3000...
start http://localhost:3000

echo.
echo =======================================================
echo ¡Listo! No cierres la ventana del Backend que se abrio.
echo =======================================================
