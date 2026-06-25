# Win NetWatch RMM

Sistema web local para descubrimiento, monitoreo y administracion de equipos Windows en redes corporativas.

## Stack

- Backend: Node.js 22, Express, WebSocket
- Frontend: React, Vite, Tailwind CSS
- Base de datos: PostgreSQL 16
- Despliegue: Docker Compose

## Redes configuradas

- `172.30.100.0/24` - Antofagasta Rendic
- `172.30.101.0/24` - Antofagasta Matta
- `172.30.102.0/24` - Antofagasta Diario
- `172.30.110.0/24` - Arica
- `172.30.112.0/24` - Iquique

## Inicio rapido

1. Copia el archivo de variables:

```powershell
Copy-Item .env.example .env
```

2. Levanta los servicios:

```powershell
docker compose up --build
```

3. Abre la aplicacion:

- Frontend: http://localhost:3000
- API: http://localhost:8080/api/health

## Credenciales iniciales

- Usuario: `admin@local`
- Password: `Admin123!`

Cambia estas credenciales antes de usar el sistema en produccion.

## Capacidades incluidas

- Descubrimiento periodico por subred.
- Ping por host con multiples intentos y perdida de paquetes.
- Deteccion de puertos Windows/RDP: `3389`, `445`, `135`, `139`, `5985`, `5986`.
- Alta de equipos nuevos por umbral de confianza para reducir falsos positivos.
- Resolucion de hostname cuando el sistema operativo lo permite.
- Captura de MAC desde ARP/NDP cuando esta disponible.
- Dashboard en tiempo casi real mediante WebSocket.
- Fichas tecnicas, administrativas e inventario.
- Historial de eventos, alertas y auditoria.
- Roles y permisos granulares.
- Descarga de archivo `.rdp`.
- Registro de conexiones RDP.
- Configuracion de alertas por Web Push, Telegram, correo y Teams.
- Exportacion CSV compatible con Excel.
- Tickets, etiquetas y busqueda avanzada.
- Tema claro/oscuro.

## Operaciones administrativas

Wake-On-LAN, reinicio, apagado remoto y ejecucion remota de PowerShell estan modelados como acciones auditadas. En esta primera version quedan implementadas como endpoints protegidos y registradas en auditoria; para ejecutarlas realmente en produccion debes configurar un runner seguro con WinRM/PowerShell Remoting, credenciales cifradas y reglas de aprobacion.

## Seguridad recomendada

- Usar HTTPS detras de un proxy interno.
- Cambiar `JWT_SECRET` y `CREDENTIAL_KEY`.
- Restringir el acceso al puerto de API por firewall.
- Activar MFA en el proxy corporativo si existe.
- Usar cuentas de servicio con privilegios minimos.
- Separar la red de gestion de la red de usuarios.
- Revisar periodicamente la tabla `audit_log`.

## Estructura

```text
win-netwatch/
  backend/      API, servicios de monitoreo y migraciones
  frontend/     Dashboard React
  docker-compose.yml
  .env.example
```
