# ========================================================
#   INICIADOR DEL COLECTOR - WIN NETWATCH
# ========================================================

# Cambiar el directorio de trabajo a la ubicacion del script
$ScriptPath = $MyInvocation.MyCommand.Path
if ($ScriptPath) {
    $ScriptDir = Split-Path -Parent $ScriptPath
    Set-Location $ScriptDir
} else {
    # Directorio por defecto especificado por el usuario
    Set-Location "C:\Users\sistemas\Desktop\collector"
}

Clear-Host
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   COLECTOR AUTONOMO DE RED - WIN NETWATCH" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si Node.js esta instalado
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[x] ERROR: Node.js no esta instalado en este sistema." -ForegroundColor Red
    Write-Host "Por favor, instale Node.js desde https://nodejs.org/ e intentelo de nuevo." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presione Enter para salir..."
    Exit
}

# Ejecutar el colector en Node.js
Write-Host "[+] Iniciando ciclo de escaneo continuo..." -ForegroundColor Green
node colector.mjs
