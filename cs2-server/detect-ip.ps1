# Prints the LAN IPv4 of this PC: physical adapters only (no WSL/VPN), wired before Wi-Fi.
$adapters = Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Sort-Object @{ Expression = { $_.PhysicalMediaType -ne '802.3' } }, ifIndex
foreach ($a in $adapters) {
    $ip = Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
    if ($ip) { $ip.IPAddress; exit 0 }
}
exit 1