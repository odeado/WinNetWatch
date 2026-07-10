# Script de diagnostico de memoria RAM para Win NetWatch
# Registra estadisticas de memoria fisica y virtual, pools de kernel y procesos principales.

$logFile = Join-Path $PSScriptRoot "registro_uso_ram.txt"

function Obtener-LogInfo {
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    # 1. Obtener datos generales del sistema
    $os = Get-CimInstance Win32_OperatingSystem
    $totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    
    # 2. Obtener datos de contadores de rendimiento de memoria
    $perfMem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
    $availableBytes = $perfMem.AvailableBytes
    $committedBytes = $perfMem.CommittedBytes
    $commitLimit = $perfMem.CommitLimit
    $nonPagedPool = $perfMem.PoolNonpagedBytes
    $pagedPool = $perfMem.PoolPagedBytes
    $standbyCache = $perfMem.StandbyCacheNormalPriorityBytes
    
    # Convertir a GB
    $availableGB = [math]::Round($availableBytes / 1GB, 2)
    $committedGB = [math]::Round($committedBytes / 1GB, 2)
    $limitGB = [math]::Round($commitLimit / 1GB, 2)
    $nonPagedGB = [math]::Round($nonPagedPool / 1GB, 2)
    $pagedGB = [math]::Round($pagedPool / 1GB, 2)
    $standbyGB = [math]::Round($standbyCache / 1GB, 2)
    $usedPhysRAM = [math]::Round($totalRAM - $freeRAM, 2)
    $pctUsed = [math]::Round(($usedPhysRAM / $totalRAM) * 100, 1)

    $out = @()
    $out += "=========================================================================="
    $out += "REGISTRO DE DIAGNOSTICO DE MEMORIA - $now"
    $out += "=========================================================================="
    $out += "ESTADISTICAS GENERALES DE RAM:"
    $out += "  - RAM Fisica Total:           $totalRAM GB"
    $out += "  - RAM Fisica Libre (Complet): $freeRAM GB"
    $out += "  - RAM Fisica en Uso:          $usedPhysRAM GB ($pctUsed" + "%)"
    $out += "  - RAM Disponible (OS):        $availableGB GB (incluye cache en espera)"
    $out += "  - Cache en Espera (Standby):  $standbyGB GB"
    $out += "  - Pool No Paginado (Drivers): $nonPagedGB GB"
    $out += "  - Pool Paginado:              $pagedGB GB"
    $out += "  - Memoria Confirmada (Virtual):$committedGB GB / $limitGB GB"
    $out += ""
    
    # 3. Procesos principales por RAM fisica (Working Set)
    $out += "TOP 15 PROCESOS POR USO DE RAM FISICA (Working Set):"
    $out += "  PID    ProcessName          WorkingSet_MB  Private_MB"
    $out += "  ---    -----------          -------------  ----------"
    $procRAM = Get-Process | Sort-Object -Property WorkingSet -Descending | Select-Object -First 15
    foreach ($p in $procRAM) {
        $ws = [math]::Round($p.WorkingSet / 1MB, 1)
        $priv = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
        $out += "  {0,-6} {1,-20} {2,-14} {3,-10}" -f $p.Id, $p.ProcessName, $ws, $priv
    }
    $out += ""

    # 4. Procesos principales por Memoria Confirmada (Private Memory)
    $out += "TOP 15 PROCESOS POR MEMORIA CONFIRMADA (Private Memory/Commit):"
    $out += "  PID    ProcessName          Private_MB     WorkingSet_MB"
    $out += "  ---    -----------          ----------     -------------"
    $procCommit = Get-Process | Sort-Object -Property PrivateMemorySize64 -Descending | Select-Object -First 15
    foreach ($p in $procCommit) {
        $ws = [math]::Round($p.WorkingSet / 1MB, 1)
        $priv = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
        $out += "  {0,-6} {1,-20} {2,-14} {3,-10}" -f $p.Id, $p.ProcessName, $priv, $ws
    }
    $out += "==========================================================================" + "`r`n`r`n"
    
    return $out -join "`r`n"
}

# Ejecucion
$info = Obtener-LogInfo
Write-Output $info
$info | Add-Content -Path $logFile
Write-Host "[+] Diagnostico completado. Registrado en: $logFile" -ForegroundColor Green
