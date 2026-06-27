<#
.SYNOPSIS
    Script de reporte de inventario NetWatch.
    Compatible con PowerShell 2.0+ (Windows XP/7/2008 en adelante).
    Recopila caracteristicas del equipo y las reporta al backend de NetWatch.
.PARAMETER ServerUrl
    La URL base del backend de NetWatch (ej: http://172.30.100.29:8080).
#>
param(
    [string]$ServerUrl = "http://localhost:8080"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "    RECOPILADOR DE INVENTARIO NETWATCH" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# -------------------------------------------------------
# 1. Obtener IP local activa (compatible PS 2.0 via WMI)
# -------------------------------------------------------
$ip = $null
$mac = $null

try {
    # Usar WMI en lugar de Get-NetIPAddress (PS 2.0 compatible)
    $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object {
        $_.IPEnabled -eq $true -and
        $_.IPAddress -ne $null
    }

    # Filtrar IPs validas (excluir loopback y APIPA)
    foreach ($adapter in $adapters) {
        foreach ($addr in $adapter.IPAddress) {
            if ($addr -match "^\d+\.\d+\.\d+\.\d+$" -and
                $addr -notlike "127.*" -and
                $addr -notlike "169.254.*") {
                
                # Preferir segmento 172.30.* si existe
                if ($addr -like "172.30.*") {
                    $ip  = $addr
                    $rawMac = $adapter.MACAddress
                    if ($rawMac) { $mac = $rawMac.Replace("-", ":").ToUpper() }
                    break
                }
                # Sino guardar el primero que encontremos como fallback
                if (-not $ip) {
                    $ip  = $addr
                    $rawMac = $adapter.MACAddress
                    if ($rawMac) { $mac = $rawMac.Replace("-", ":").ToUpper() }
                }
            }
        }
        if ($ip -like "172.30.*") { break }
    }
} catch {
    Write-Host "[!] Error al leer adaptadores de red via WMI: $_" -ForegroundColor Yellow
}

# Fallback: parsear salida de ipconfig si WMI no dio resultado
if (-not $ip) {
    try {
        $ipcfg = ipconfig | Out-String
        $matches2 = [regex]::Matches($ipcfg, "IPv4[^:]*:\s*(\d+\.\d+\.\d+\.\d+)")
        foreach ($m in $matches2) {
            $addr = $m.Groups[1].Value
            if ($addr -notlike "127.*" -and $addr -notlike "169.254.*") {
                if ($addr -like "172.30.*") { $ip = $addr; break }
                if (-not $ip) { $ip = $addr }
            }
        }
        # Si PS version antigua sin grupos IPv4, intentar "Direccion IP" (ES)
        if (-not $ip) {
            $matches3 = [regex]::Matches($ipcfg, "Direcci[^:]+:\s*(\d+\.\d+\.\d+\.\d+)")
            foreach ($m in $matches3) {
                $addr = $m.Groups[1].Value
                if ($addr -notlike "127.*" -and $addr -notlike "169.254.*") {
                    if ($addr -like "172.30.*") { $ip = $addr; break }
                    if (-not $ip) { $ip = $addr }
                }
            }
        }
    } catch {}
}

if (-not $ip) {
    Write-Error "No se pudo determinar una direccion IP local activa."
    Write-Host "Presione una tecla para salir..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "[+] IP Local detectada: $ip" -ForegroundColor Green
if ($mac) { Write-Host "[+] MAC detectada:       $mac" -ForegroundColor Green }

# -------------------------------------------------------
# 2. Datos del sistema (WMI - compatible PS 2.0)
# -------------------------------------------------------
$hostname = $env:COMPUTERNAME

# OS
$os = "Windows"
try {
    $osInfo = Get-WmiObject Win32_OperatingSystem
    $os = $osInfo.Caption
} catch {}

# Fabricante / Modelo / Serie
$brand       = ""
$model       = ""
$serialNumber = ""
try {
    $cs = Get-WmiObject Win32_ComputerSystem
    $brand = $cs.Manufacturer
    $model = $cs.Model
} catch {}
try {
    $bios = Get-WmiObject Win32_Bios
    $serialNumber = $bios.SerialNumber
} catch {}

# CPU
$cpu = ""
try {
    $proc = Get-WmiObject Win32_Processor | Select-Object -First 1
    $cpu = $proc.Name.Trim()
} catch {}

# RAM en GB
$ram = ""
try {
    $cs2 = Get-WmiObject Win32_ComputerSystem
    $ramGB = [Math]::Round($cs2.TotalPhysicalMemory / 1GB)
    $ram = "$ramGB GB"
} catch {}

# Disco total (discos locales fijos)
$storage = ""
try {
    $disks = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
    $totalBytes = 0
    foreach ($d in $disks) { $totalBytes += $d.Size }
    $storage = "$([Math]::Round($totalBytes / 1GB)) GB"
} catch {}

# GPU
$gpu = ""
try {
    $vc = Get-WmiObject Win32_VideoController | Select-Object -First 1
    $gpu = $vc.Name
} catch {}

# Placa madre
$motherboard = ""
try {
    $bb = Get-WmiObject Win32_BaseBoard
    $motherboard = $bb.Product
} catch {}

# -------------------------------------------------------
# 3. Antivirus
# -------------------------------------------------------
$antivirus = "Desconocido"
try {
    # SecurityCenter2 (Vista/7/8/10/11)
    $avProduct = Get-WmiObject -Namespace "root\SecurityCenter2" -Class "AntiVirusProduct" -ErrorAction SilentlyContinue
    if ($avProduct) {
        $antivirus = ($avProduct | ForEach-Object { $_.displayName }) -join ", "
    } else {
        # SecurityCenter (XP/2003)
        $avProduct = Get-WmiObject -Namespace "root\SecurityCenter" -Class "AntiVirusProduct" -ErrorAction SilentlyContinue
        if ($avProduct) {
            $antivirus = ($avProduct | ForEach-Object { $_.displayName }) -join ", "
        } else {
            $antivirus = "Windows Defender"
        }
    }
} catch {
    $antivirus = "Windows Defender"
}

# -------------------------------------------------------
# 4. Version de Office (desde registro)
# -------------------------------------------------------
$office = "No detectado"
try {
    $keys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $officeApps = Get-ItemProperty $keys -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like "*Microsoft Office*" -or $_.DisplayName -like "*Microsoft 365*" } |
        Select-Object -ExpandProperty DisplayName
    if ($officeApps) {
        # Tomar el nombre mas largo (mas descriptivo)
        $office = $officeApps | Sort-Object { $_.Length } -Descending | Select-Object -First 1
    }
} catch {}

# -------------------------------------------------------
# 5. Mostrar resumen
# -------------------------------------------------------
Write-Host ""
Write-Host "--- Datos recopilados ---" -ForegroundColor White
Write-Host "  Hostname:     $hostname"
Write-Host "  IP:           $ip"
Write-Host "  MAC:          $mac"
Write-Host "  OS:           $os"
Write-Host "  Marca:        $brand $model"
Write-Host "  Serie:        $serialNumber"
Write-Host "  CPU:          $cpu"
Write-Host "  RAM:          $ram"
Write-Host "  Disco:        $storage"
Write-Host "  GPU:          $gpu"
Write-Host "  Antivirus:    $antivirus"
Write-Host "  Office:       $office"
Write-Host ""

# -------------------------------------------------------
# 6. Construir JSON manualmente (PS 2.0 no tiene ConvertTo-Json en algunas builds)
# -------------------------------------------------------
function EscapeJson($s) {
    if ($s -eq $null) { return "" }
    return $s.ToString().Replace("\", "\\").Replace('"', '\"').Replace("`n", "\n").Replace("`r", "")
}

$jsonPayload = "{`n"
$jsonPayload += "  `"hostname`": `"$(EscapeJson $hostname)`",`n"
$jsonPayload += "  `"ip`": `"$(EscapeJson $ip)`",`n"
$jsonPayload += "  `"mac`": `"$(EscapeJson $mac)`",`n"
$jsonPayload += "  `"os`": `"$(EscapeJson $os)`",`n"
$jsonPayload += "  `"brand`": `"$(EscapeJson $brand)`",`n"
$jsonPayload += "  `"model`": `"$(EscapeJson $model)`",`n"
$jsonPayload += "  `"serial_number`": `"$(EscapeJson $serialNumber)`",`n"
$jsonPayload += "  `"cpu`": `"$(EscapeJson $cpu)`",`n"
$jsonPayload += "  `"ram`": `"$(EscapeJson $ram)`",`n"
$jsonPayload += "  `"storage`": `"$(EscapeJson $storage)`",`n"
$jsonPayload += "  `"gpu`": `"$(EscapeJson $gpu)`",`n"
$jsonPayload += "  `"motherboard`": `"$(EscapeJson $motherboard)`",`n"
$jsonPayload += "  `"office`": `"$(EscapeJson $office)`",`n"
$jsonPayload += "  `"antivirus`": `"$(EscapeJson $antivirus)`"`n"
$jsonPayload += "}"

# -------------------------------------------------------
# 7. Enviar al servidor
# -------------------------------------------------------
$targetUrl = ($ServerUrl.TrimEnd('/')) + "/api/devices/agent-report"
Write-Host "[+] Enviando reporte a $targetUrl ..." -ForegroundColor Yellow

$sent = $false

# Intentar con Invoke-RestMethod (PS 3.0+)
try {
    $response = Invoke-RestMethod -Uri $targetUrl -Method Post -Body $jsonPayload -ContentType "application/json" -TimeoutSec 15
    if ($response.ok) {
        Write-Host "[!] Reporte enviado con exito. El equipo ya aparece en NetWatch." -ForegroundColor Green
        $sent = $true
    } else {
        Write-Host "[x] El servidor respondio con error: $($response.error)" -ForegroundColor Red
        $sent = $true
    }
} catch {
    # Invoke-RestMethod no disponible (PS 2.0) o fallo de red
}

# Fallback: usar WebClient (PS 2.0 compatible)
if (-not $sent) {
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("Content-Type", "application/json")
        $responseBytes = $wc.UploadData($targetUrl, "POST", [System.Text.Encoding]::UTF8.GetBytes($jsonPayload))
        $responseText  = [System.Text.Encoding]::UTF8.GetString($responseBytes)
        Write-Host "[!] Reporte enviado con exito (WebClient)." -ForegroundColor Green
        Write-Host "    Respuesta: $responseText" -ForegroundColor Gray
        $sent = $true
    } catch {
        Write-Host "[x] Error de conexion: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Si no se pudo enviar, guardar JSON local
if (-not $sent) {
    $safeIp   = $ip.Replace('.', '_')
    $fileName = "Ficha_${hostname}_${safeIp}.json"
    Write-Host ""
    Write-Host "[!] No se pudo conectar al servidor. Guardando ficha local..." -ForegroundColor Yellow
    try {
        [System.IO.File]::WriteAllText(".\$fileName", $jsonPayload, [System.Text.Encoding]::UTF8)
        Write-Host "[+] Ficha guardada como: .\$fileName" -ForegroundColor Green
        Write-Host "[i] Enviala al administrador para importarla manualmente." -ForegroundColor Cyan
    } catch {
        Write-Host "[x] No se pudo guardar el archivo: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Presione una tecla para cerrar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
