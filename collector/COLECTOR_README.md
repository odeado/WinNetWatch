# Colector Autónomo de Red - Win NetWatch

Este directorio contiene el colector de red autónomo de **Win NetWatch**. Su función es realizar escaneos de red en segundo plano las 24 horas del día (7 días a la semana) desde una computadora de trabajo dedicada, y enviar los resultados directamente a la base de datos en la nube (Firestore).

De esta manera, la información en vivo de tus switches y equipos estará siempre disponible desde tu celular o panel web, **sin necesidad de que tengas encendido Docker en tu laptop**.

---

## 📋 Requisitos Previos

En la computadora de la oficina donde dejes corriendo el colector, realiza lo siguiente:

1. **Instalar Node.js**:
   * Descarga e instala Node.js (versión LTS recomendada) desde su sitio oficial: [https://nodejs.org/](https://nodejs.org/)
   * Durante la instalación, pulsa "Siguiente" en todo manteniendo la configuración por defecto.

---

## ⚙️ Configuración rápida

Edita el archivo **`colector.env`** en este mismo directorio con un editor de texto (como el Bloc de Notas) para ajustar los parámetros de red:

```ini
# Subredes locales a escanear (separa con comas si son varias)
SCAN_SUBNETS=172.30.100.0/24,172.30.101.0/24,172.30.102.0/24,172.30.110.0/24,172.30.112.0/24

# Cada cuántos segundos realiza un escaneo completo (por defecto 120 segundos)
SCAN_INTERVAL_SECONDS=120

# Credenciales de acceso de un usuario registrado en el sistema
COLLECTOR_EMAIL=admin@mg.cl
COLLECTOR_PASSWORD=Admin123!
```

---

## 🚀 Cómo Ejecutar el Colector

### Opción A: Ejecución Manual (Visible)
Doble clic sobre el archivo **`iniciar_colector.bat`**. 
Se abrirá una consola donde verás el progreso del escaneo en tiempo real y el estado de la comunicación con la base de datos de Firebase. Para apagarlo, simplemente cierra la ventana.

### Opción B: Ejecución Automática en Segundo Plano (Oculto)
Si prefieres que se inicie solo al arrancar la computadora y funcione en segundo plano de manera invisible:
1. Haz doble clic sobre el archivo **`configurar_colector_servicio.bat`**.
2. Escribe `S` y presiona Enter para confirmar.
3. ¡Listo! El colector se agregará al programador de tareas de Windows y arrancará de forma oculta en segundo plano cada vez que inicies sesión en Windows.

---

## 🛠️ Comprobación y Soporte

* **Para comprobar si está corriendo**: Abre el *Administrador de Tareas* de Windows (Ctrl + Shift + Esc) y confirma que exista un proceso con el nombre `node` o `Node.js JavaScript Runtime`.
* **Para desactivar el inicio automático**: Si deseas remover la tarea programada, abre una consola de PowerShell o CMD como administrador y ejecuta:
  `schtasks /delete /tn "WinNetWatchCollector" /f`
