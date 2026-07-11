@echo off
title Iniciar Win NetWatch Local
echo =======================================================
echo           INICIANDO WIN NETWATCH LOCAL
echo =======================================================
echo.

:: 1. Verificar si Docker esta corriendo
echo [+] Verificando estado de Docker...
docker ps >nul 2>&1
if %errorlevel% equ 0 goto docker_ok

echo [!] Docker Desktop no esta iniciado. Iniciandolo...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" --minimized

echo [+] Esperando a que el motor de Docker responda...
:wait_docker
ping 127.0.0.1 -n 4 >nul
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo     . [aun conectando...]
    goto wait_docker
)

:docker_ok
echo [+] Docker esta listo!

:: 2. Detener el contenedor API de Docker por si acaso (para liberar puerto 8080)
echo [+] Liberando puerto 8080 en Docker...
docker-compose stop api >nul 2>&1

:: Liberar puerto 8080 en Windows (por si quedo un proceso Node local del backend colgado)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do (
    echo [+] Liberando puerto 8080 ocupado por PID %%a en Windows...
    taskkill /f /pid %%a >nul 2>&1
)

:: 3. Levantar la base de datos (Postgres) y el Frontend
echo [+] Levantando Base de Datos y Frontend en Docker...
docker-compose up -d postgres
docker-compose up -d --no-deps --build frontend
docker-compose stop api >nul 2>&1

:: 4. Ejecutar el backend local en segundo plano (oculto)
echo [+] Iniciando Backend en segundo plano (red local / VPN)...
start "" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Set-Location -LiteralPath '%~dp0backend'; npm run dev"

:: 5. Esperar para dar tiempo a inicializar
ping 127.0.0.1 -n 4 >nul
echo [+] Abriendo navegador en modo pantalla completa (Kiosk)...

:: Buscar Chrome 64-bit
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" goto usar_chrome64

:: Buscar Chrome 32-bit
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" goto usar_chrome32

:: Buscar Edge 32-bit
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" goto usar_edge32

:: Buscar Edge 64-bit
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" goto usar_edge64

:: Ningun navegador detectado
echo [!] No se detecto Chrome ni Edge. Abriendo navegador predeterminado...
start http://localhost:3000
goto fin

:usar_chrome64
echo [+] Usando Google Chrome en modo Kiosk en pantalla secundaria...
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk --window-position=1920,0 --no-first-run --user-data-dir="%TEMP%\netwatch-kiosk" http://localhost:3000
goto fin

:usar_chrome32
echo [+] Usando Google Chrome (32-bit) en modo Kiosk en pantalla secundaria...
start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk --window-position=1920,0 --no-first-run --user-data-dir="%TEMP%\netwatch-kiosk" http://localhost:3000
goto fin

:usar_edge32
echo [+] Usando Microsoft Edge en modo Kiosk en pantalla secundaria...
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --kiosk --window-position=1920,0 --no-first-run --user-data-dir="%TEMP%\netwatch-kiosk" http://localhost:3000
goto fin

:usar_edge64
echo [+] Usando Microsoft Edge (64-bit) en modo Kiosk en pantalla secundaria...
start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --kiosk --window-position=1920,0 --no-first-run --user-data-dir="%TEMP%\netwatch-kiosk" http://localhost:3000
goto fin

:fin
echo.
echo =======================================================
echo  Listo! El backend se inicio en segundo plano oculto.
echo  Cierra la app con ALT+F4 cuando quieras salir.
echo =======================================================
