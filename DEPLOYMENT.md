# Guia de despliegue local

## Requisitos

- Docker Desktop o Docker Engine con Docker Compose.
- Servidor Windows o Linux dentro de la red corporativa.
- Acceso ICMP permitido desde el servidor hacia las subredes.
- Acceso TCP al puerto `3389` para deteccion RDP.
- DNS inverso y ARP habilitados si se desea hostname/MAC con mejor precision.

## Instalacion

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up --build -d
```

Verifica:

```powershell
docker compose ps
docker compose logs -f api
```

## Acceso

- Aplicacion: http://localhost:3000
- API: http://localhost:8080/api/health
- Usuario inicial: `admin@local`
- Password inicial: `Admin123!`

## Puesta en produccion

1. Cambia `POSTGRES_PASSWORD`, `JWT_SECRET` y `CREDENTIAL_KEY`.
2. Coloca la aplicacion detras de HTTPS interno.
3. Restringe acceso a `8080` y `5432` por firewall.
4. Crea usuarios nominales y elimina credenciales compartidas.
5. Define un plan de respaldo para el volumen `postgres_data`.
6. Ajusta `SCAN_INTERVAL_SECONDS` segun el tamano de red.

## Escalabilidad

Para mas de 5.000 equipos:

- Ejecutar la API con mas replicas detras de un proxy interno.
- Separar el servicio de escaneo en workers por subred.
- Mantener PostgreSQL en disco SSD.
- Crear particiones por fecha para `events` y `audit_log`.
- Reducir frecuencia de escaneo completo y usar verificaciones incrementales.

## RDP

La aplicacion descarga un archivo `.rdp` autenticado por permisos. Los navegadores no pueden abrir `mstsc.exe` directamente de forma segura sin politicas locales o un agente instalado. Para apertura automatica real se recomienda:

- Politica corporativa que asocie `.rdp` al cliente Microsoft Remote Desktop.
- Agente local firmado para protocolo personalizado interno.
- Registro de cada conexion en `rdp_history`.

## Acciones remotas

Los endpoints de Wake-On-LAN, reinicio, apagado y PowerShell quedan protegidos y auditados. Para ejecucion real:

- Usa WinRM/PowerShell Remoting con HTTPS.
- Emplea cuentas de servicio de privilegio minimo.
- Firma scripts PowerShell.
- Registra salida, usuario, equipo y hash del script.
- Exige aprobacion para comandos destructivos.

## Alertas

Configura en `.env`:

- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Correo: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- Teams: `TEAMS_WEBHOOK_URL`
- Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

Si no se configuran, las alertas quedan registradas localmente en PostgreSQL.
