<#
.SYNOPSIS
    Script de importacion masiva de fichas de NetWatch.
    Lee todos los archivos Ficha_*.json en la carpeta actual y los envia al backend.
.PARAMETER ServerUrl
    La URL del backend de NetWatch (por defecto http://localhost:8080).
#>
[CmdletBinding()]
param(
    [string]$ServerUrl = "http://localhost:8080"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "    IMPORTADOR MASIVO DE FICHAS NETWATCH" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Buscar todos los archivos que coincidan con el patron Ficha_*.json
$files = Get-ChildItem -Filter "Ficha_*.json" -ErrorAction SilentlyContinue

if ($files.Count -eq 0) {
    Write-Host "[x] No se encontraron archivos 'Ficha_*.json' en esta carpeta." -ForegroundColor Red
    Write-Host "[i] Asegurate de colocar los archivos JSON recopilados en la misma carpeta que este script." -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 0
}

Write-Host "[+] Se encontraron $($files.Count) fichas listas para importar." -ForegroundColor Green
Write-Host "[+] URL de destino: $ServerUrl" -ForegroundColor Green
Write-Host ""

$successCount = 0
$failCount = 0

foreach ($file in $files) {
    Write-Host "[*] Importando $($file.Name)..." -ForegroundColor Yellow
    
    $targetUrl = "$($ServerUrl.TrimEnd('/'))/api/devices/agent-report"
    
    try {
        # Leer el contenido del archivo JSON
        $payload = Get-Content -Path $file.FullName -Raw -Encoding utf8
        
        # Enviar al servidor
        $response = Invoke-RestMethod -Uri $targetUrl -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 5
        
        if ($response.ok) {
            Write-Host "    [v] Importado con exito!" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "    [x] Error del servidor: $($response.error)" -ForegroundColor Red
            $failCount++
        }
    } catch {
        Write-Host "    [x] Error de conexion al procesar el archivo: $_" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "    RESUMEN DE IMPORTACION" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "[+] Exitosos: $successCount" -ForegroundColor Green
Write-Host "[-] Fallidos: $failCount" -ForegroundColor ($failCount -gt 0 ? "Red" : "Gray")
Write-Host ""

pause
