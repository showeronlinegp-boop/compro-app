# Elimina el link compro-claude:// del usuario actual de Windows.
#
#   powershell -ExecutionPolicy Bypass -File tools\claude-link\desregistrar.ps1

$base = 'HKCU:\Software\Classes\compro-claude'
if (Test-Path $base) {
    Remove-Item -Path $base -Recurse -Force
    Write-Host "Link compro-claude:// eliminado"
} else {
    Write-Host "El link compro-claude:// no estaba registrado"
}
