$ErrorActionPreference = 'SilentlyContinue'
Set-Location (Split-Path -Parent $PSScriptRoot)

# Hentikan proses child yang decrypted (tsx/vite) dengan mencocokkan path workspace,
# lalu proses npm/cmd induknya.
$workspacePattern = 'smart-greenhouse-web'
$targets = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -in @('node.exe', 'cmd.exe') -and $_.CommandLine -like "*$workspacePattern*"
    }

$stopped = 0
foreach ($proc in $targets) {
    Write-Host "Menghentikan PID $($proc.ProcessId) ($($proc.Name))"
    Stop-Process -Id $proc.ProcessId -Force
    $stopped++
}

# Pastikan port yang dipakai dev server benar-benar bebas.
$ports = 1883, 3001, 5173, 9001
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force
        Write-Host "Membebaskan port $port (PID $($conn.OwningProcess))"
        $stopped++
    }
}

Write-Host "Selesai. $stopped proses dihentikan."