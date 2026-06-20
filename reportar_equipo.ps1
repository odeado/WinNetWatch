<#
.SYNOPSIS
    Script de reporte de inventario NetWatch.
    Recopila caracteristicas del equipo (CPU, RAM, MAC, etc.) y las reporta al backend de NetWatch.
.PARAMETER ServerUrl
    La URL base del backend de NetWatch (ej: http://172.30.100.29:8080).
#>
[CmdletBinding()]
param(
    [string]$ServerUrl = "http://localhost:8080"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "    RECOPILADOR DE INVENTARIO NETWATCH" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener la direccion IP local activa (excluyendo loopback y virtual switches de Docker/Hyper-V)
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "*vEthernet*" -and $_.InterfaceAlias -notlike "*Loopback*" } |
    Sort-Object IPAddress

$ip = $null
if ($ipAddresses.Count -eq 1) {
    $ip = $ipAddresses.IPAddress
} elseif ($ipAddresses.Count -gt 1) {
    # Preferir IPs del segmento 172.30.* o similar si existe
    $vpnIp = $ipAddresses | Where-Object { $_.IPAddress -like "172.30.*" } | Select-Object -First 1
    if ($vpnIp) {
        $ip = $vpnIp.IPAddress
    } else {
        $ip = $ipAddresses[0].IPAddress
    }
}

if (-not $ip) {
    Write-Error "No se pudo determinar una direccion IP local activa."
    exit 1
}

Write-Host "[+] IP Local detectada: $ip" -ForegroundColor Green

# 2. Obtener la MAC address activa
$mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress
if ($mac) {
    $mac = $mac.Replace("-", ":").ToUpper()
}

# 3. Datos del hardware y sistema
$hostname = $env:COMPUTERNAME
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$system = Get-CimInstance Win32_ComputerSystem
$brand = $system.Manufacturer
$model = $system.Model
$serialNumber = (Get-CimInstance Win32_Bios).SerialNumber

# CPU
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name

# RAM (en GB)
$totalRamBytes = $system.TotalPhysicalMemory
$ram = "$([Math]::Round($totalRamBytes / 1GB)) GB"

# Disco Duro (Suma de capacidad de discos locales fijos)
$disks = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
$totalDiskSize = 0
foreach ($disk in $disks) {
    $totalDiskSize += $disk.Size
}
$storage = "$([Math]::Round($totalDiskSize / 1GB)) GB"

# Tarjeta Grafica
$gpu = (Get-CimInstance Win32_VideoController | Select-Object -First 1).Name

# Placa Madre
$motherboard = (Get-CimInstance Win32_BaseBoard).Product

# 4. Antivirus
$antivirus = "Desconocido"
try {
    $avProduct = Get-CimInstance -Namespace "root\SecurityCenter2" -ClassName "AntiVirusProduct" -ErrorAction SilentlyContinue
    if ($avProduct) {
        $antivirus = ($avProduct | Select-Object -ExpandProperty displayName) -join ", "
    } else {
        $antivirus = "Windows Defender"
    }
} catch {
    $antivirus = "Windows Defender"
}

# 5. Version de Office
$office = "No detectado"
try {
    # Buscar en el registro versiones instaladas de Office
    $keys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $officeApps = Get-ItemProperty $keys -ErrorAction SilentlyContinue | 
        Where-Object { $_.DisplayName -like "*Microsoft Office*" -or $_.DisplayName -like "*Microsoft 365*" } | 
        Select-Object -ExpandProperty DisplayName
    
    if ($officeApps) {
        # Limpiar y extraer la version mas larga o representativa
        $office = ($officeApps | Sort-Object Length -Descending | Select-Object -First 1)
    }
} catch {}

# 6. Construir el payload JSON
$payload = @{
    hostname      = $hostname
    ip            = $ip
    mac           = $mac
    os            = $os
    brand         = $brand
    model         = $model
    serial_number = $serialNumber
    cpu           = $cpu
    ram           = $ram
    storage       = $storage
    gpu           = $gpu
    motherboard   = $motherboard
    office        = $office
    antivirus     = $antivirus
} | ConvertTo-Json

# 7. Enviar datos al servidor
$targetUrl = "$($ServerUrl.TrimEnd('/'))/api/devices/agent-report"
Write-Host "[+] Enviando reporte de hardware a $targetUrl..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $targetUrl -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 10
    if ($response.ok) {
        Write-Host "[!] Reporte enviado con exito! El equipo ahora tiene la ficha completa en el sistema." -ForegroundColor Green
    } else {
        Write-Host "[x] Error devuelto por el servidor: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "[x] Error de conexion con el servidor. Verifica que la URL sea correcta y el backend este en ejecucion." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
pause
