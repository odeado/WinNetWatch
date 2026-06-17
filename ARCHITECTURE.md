# Arquitectura

## Componentes

- `frontend`: interfaz React responsive.
- `api`: API REST, autenticacion JWT, WebSocket y motor de monitoreo.
- `postgres`: almacenamiento local persistente.

## Flujo de monitoreo

1. El monitor expande las subredes configuradas.
2. Ejecuta ping por host con concurrencia limitada.
3. Si el host responde, prueba TCP `3389`.
4. Intenta obtener hostname por DNS inverso.
5. Intenta obtener MAC desde tabla ARP/NDP.
6. Actualiza `devices`.
7. Si cambia el estado, crea `events`, `alerts` y emite WebSocket.

## Modelo de permisos

Roles incluidos:

- Super Administrador
- Administrador
- Soporte TI
- Supervisor
- Solo Lectura

Los permisos se guardan como JSON en `roles.permissions`. El backend valida permisos por endpoint.

## Tablas principales

- `devices`: ficha tecnica, administrativa e inventario.
- `app_users`: usuarios de aplicacion.
- `roles`: permisos.
- `events`: historial operativo.
- `alerts`: alertas por canal.
- `credentials`: secretos cifrados AES-256-GCM.
- `rdp_history`: conexiones y descargas RDP.
- `tickets`: tickets integrados.
- `audit_log`: trazabilidad de cambios.

## Endpoints destacados

- `POST /api/auth/login`
- `GET /api/dashboard/summary`
- `GET /api/devices`
- `GET /api/devices/:id`
- `PATCH /api/devices/:id`
- `GET /api/devices/:id/rdp`
- `POST /api/devices/:id/actions/:action`
- `GET /api/network-map`
- `GET /api/export/devices.csv`
- `GET /ws`

