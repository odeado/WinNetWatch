# Informe Técnico: Win NetWatch RMM

**Win NetWatch** es un sistema web local e híbrido de nivel empresarial diseñado para el **descubrimiento automático, monitoreo en tiempo real, gestión de inventario y administración remota** de equipos Windows e infraestructura de red dentro de redes corporativas.

A continuación se detalla el funcionamiento completo del sistema, dividido por sus módulos funcionales, su arquitectura de datos y sus capacidades operativas.

---

## 1. Arquitectura General y Flujo de Datos

El sistema está estructurado bajo un modelo de tres capas con capacidades híbridas de sincronización en la nube:

* **Frontend:** Aplicación de una sola página (SPA) construida sobre React 18, Vite y Tailwind CSS, ofreciendo un panel responsivo con soporte para modo oscuro.
* **Backend:** Servidor Node.js 22 + Express que expone endpoints REST API y un concentrador de WebSockets (`wsHub.js`) para propagar cambios de red de manera instantánea.
* **Base de Datos:** Almacenamiento relacional persistente usando PostgreSQL 16.
* **Sincronización Híbrida (Firebase + Fallback Local):**
  * **Modo Cloud (Por defecto):** El backend sincroniza todo el estado en tiempo real hacia Google Firestore. Los clientes conectados escuchan directamente los cambios desde Firestore, ofreciendo una experiencia en la nube sumamente rápida y de bajo consumo de servidor local.
  * **Modo Local (Resiliencia):** Si la cuota mensual de Firebase se agota, o si se detecta un error de red con la nube, el sistema realiza una conmutación automática (*failover*) a llamadas REST y consultas locales en PostgreSQL mediante *polling* constante al backend.

---

## 2. Capacidades de Monitoreo y Descubrimiento de Red

El motor principal del backend (`monitor.js` y `network.js`) realiza barridos continuos y controlados de las subredes configuradas:

### Subredes Corporativas Homologadas
* **`172.30.100.0/24`** — Antofagasta Rendic (Subred principal de oficinas)
* **`172.30.101.0/24`** — Antofagasta Rendic (Subred secundaria)
* **`172.30.102.0/24`** — Antofagasta Matta
* **`172.30.110.0/24`** — Arica
* **`172.30.112.0/24`** — Iquique

### Flujo del Ciclo de Monitoreo
1. **Expansión de CIDR:** El monitor calcula todas las direcciones IP válidas dentro de los rangos de subred.
2. **Ping Inteligente:** Realiza peticiones ICMP concurrentes con reintentos para determinar latencia y porcentaje de pérdida de paquetes.
3. **Escaneo de Puertos Windows:** Si un host responde al ping, el monitor escanea los siguientes puertos clave:
   * `3389` (RDP - Escritorio Remoto)
   * `445` (SMB - Compartición de archivos)
   * `135` (RPC - Llamada a procedimientos remotos)
   * `139` (NetBIOS)
   * `5985` / `5986` (WinRM - Gestión remota segura)
4. **Resolución de Nombres (DNS):** Intenta resolver el nombre de equipo corporativo (`hostname`) mediante consultas de DNS inverso.
5. **Captura de Direcciones MAC:** Lee la tabla ARP/NDP local del servidor para asociar la dirección MAC física al dispositivo descubierto.
6. **Umbral de Confianza (Confidence Score):** Para evitar registrar falsos positivos (como IPs flotantes de dispositivos de paso), el sistema evalúa parámetros de respuesta antes de dar de alta un equipo nuevo en el inventario.

---

## 3. Detección Inteligente de Anomalías

El sistema integra algoritmos avanzados de monitoreo adaptativo y telemetría para alertar sobre comportamientos sospechosos o fallos intermitentes de hardware/red:

* **`rapid_offline` (Desconexión Rápida):** Detecta cuando un dispositivo clave se desconecta de forma abrupta tras haber estado estable.
* **`rapid_reboot` (Reinicio Rápido):** Alertas sobre equipos que cambian de estado de arranque en intervalos sumamente cortos.
* **`frequent_reboots` (Reinicios Frecuentes):** Reporta equipos que han tenido múltiples reinicios en las últimas 24 horas, lo cual suele indicar bucles de error en Windows (BSOD).
* **Telemetría de Arranque:** El sistema calcula el tiempo de actividad aproximado (`estimated_uptime_seconds`), cuenta el número total de inicios (`boot_count`) y registra la marca temporal del último reinicio (`last_reboot`).

---

## 4. Gestión de Infraestructura de Red y Mapeo de Puertos

El módulo de infraestructura permite controlar el cableado físico y lógico de los centros de datos corporativos:

### Características del Mapeo de Puertos (*Switch Port Mapping*)
* **Soporte de Marcas:** Lógica pre-configurada para switches **Cisco Catalyst, Juniper EX**, firewalls **Fortinet**, y conversores de fibra **Raisecom**.
* **Detección Automática de Tipo de Puerto:**
  * Determina si el puerto es de **Cobre** (RJ-45) o **Fibra Óptica** (SFP / SFP+).
  * Nomenclatura dinámica según el equipo: traduce el número físico del puerto a etiquetas reconocibles (ej. *Console, Wan 1, GE 0/0, Puerto SFP #1 (Fibra)*).
* **Vinculación de Equipos:** Permite documentar exactamente en qué puerto del switch físico está conectado cada computador o impresora de la empresa.

---

## 5. Fichas de Inventario e Historial Técnico

Cada dispositivo cuenta con una ficha técnica completa y auditable:

* **Información de Hardware:** Procesador (CPU), memoria RAM, almacenamiento (HDD/SSD), tarjeta de video (GPU), y modelo de placa madre.
* **Información Administrativa:** Marca, modelo, número de serie, fecha de adquisición, vigencia de la garantía, responsable técnico asignado, correo de contacto, sucursal, ciudad y departamento.
* **Estado de Gestión:** Permite clasificar el equipo en estados de ciclo de vida (activo, en reparación, retirado, bodega) y marcarlo como **Crítico** (lo que incrementa la severidad de sus alertas) o **Gestionado** (bajo control de software RMM corporativo).
* **Tickets de Soporte Integrados:** Cada equipo tiene un historial de tickets donde los técnicos de soporte pueden abrir, priorizar (baja, normal, alta), asignar y resolver incidencias de hardware o red directamente en la consola.

---

## 6. Operaciones Administrativas y Conexiones RDP

El sistema facilita las tareas cotidianas de los administradores de TI de forma segura:

* **Acceso RDP en un Clic:** El sistema genera y descarga automáticamente archivos de configuración `.rdp` dinámicos con la IP del host de destino para abrir la conexión nativa de Windows al instante.
* **Trazabilidad de Conexiones:** Cada descarga o inicio de sesión de escritorio remoto se almacena de forma inmutable en el historial (`rdp_history`), registrando quién accedió, desde qué IP y a qué hora.
* **Acciones Remotas Pre-diseñadas (Auditadas):**
  * **Wake-on-LAN (WoL):** Envío de paquetes mágicos para encendido remoto de equipos apagados.
  * **Reinicio y Apagado Remoto.**
  * **Ejecución Remota de Scripts:** Endpoint listo para conectarse con WinRM y lanzar comandos de PowerShell de manera centralizada.
  * *Nota de seguridad:* Todas estas acciones requieren roles elevados y quedan registradas con el antes y el después en el registro de auditoría (`audit_log`).

---

## 7. Roles, Permisos y Seguridad Granular

El control de acceso al sistema está regido por roles y permisos inyectados a nivel de base de datos y validados en cada petición HTTP:

| Rol | Permisos Asociados | Propósito |
| :--- | :--- | :--- |
| **Super Administrador** | `["*"]` (Acceso total) | Gestión global, modificación de usuarios y roles. |
| **Administrador** | Gestión de equipos, RDP, configuración de alertas, tickets y acciones remotas. | Administración diaria de la infraestructura de TI. |
| **Soporte TI** | Lectura y escritura de equipos, conexión RDP, gestión de tickets. | Resolución de problemas en terreno y soporte directo. |
| **Supervisor** | Lectura de equipos, ver eventos técnicos e historial de tickets. | Auditoría y visualización de reportes de estado. |
| **Solo Lectura** | Únicamente visualización de equipos y eventos del dashboard. | Monitoreo pasivo (pantallas de control, gerencia). |

---

## 8. Experiencia de Usuario y UI Premium

La interfaz de usuario ha sido pulida para ser moderna, intuitiva y atractiva:

* **Dashboard de Alto Impacto:** Gráficos de áreas con tendencias históricas de rendimiento y disponibilidad usando `Recharts`.
* **Tema Híbrido:** Selector de modo claro/oscuro (modo noche) que se almacena en el navegador para adaptarse al ambiente de trabajo de los operadores de TI.
* **Notificaciones Sonoras Premium:** Utilizando la API Web Audio nativa de los navegadores, el sistema genera sonidos sintetizados agradables (bell arpeggio en escala mayor de Do para dispositivos que vuelven a estar *online*, y acordes en tonos menores para alertas de desconexión *offline*), evitando ruidos molestos.
* **Exportación de Datos:** Descarga de reportes unificados de inventario y monitoreo en formato CSV compatible con Microsoft Excel.
