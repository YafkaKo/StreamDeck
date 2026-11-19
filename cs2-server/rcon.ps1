# Пульт админа: отправляет команды серверу по rcon. Запускать через rcon.bat (можно с любого ПК в сети арены).
param([string]$Addr, [int]$Port = 27015, [string]$Pass)

function Pkt($id, $type, $body) {
    $b = [Text.Encoding]::UTF8.GetBytes($body)
    $ms = New-Object IO.MemoryStream; $w = New-Object IO.BinaryWriter $ms
    $w.Write([int](10 + $b.Length)); $w.Write([int]$id); $w.Write([int]$type); $w.Write($b); $w.Write([byte]0); $w.Write([byte]0)
    $ms.ToArray()
}
function Read-Pkt($s) {
    $r = New-Object IO.BinaryReader $s
    $size = $r.ReadInt32(); $id = $r.ReadInt32(); $type = $r.ReadInt32(); $body = $r.ReadBytes($size - 8)
    [pscustomobject]@{ Id = $id; Type = $type; Body = [Text.Encoding]::UTF8.GetString($body, 0, [Math]::Max(0, $body.Length - 2)) }
}

if (-not $Pass) { $Pass = (Select-String -Path "$PSScriptRoot\cfg\server.cfg" -Pattern '^\s*rcon_password\s+"([^"]*)"').Matches[0].Groups[1].Value }

try {
    $c = New-Object Net.Sockets.TcpClient; $c.Connect($Addr, $Port); $s = $c.GetStream(); $s.ReadTimeout = 3000
} catch { Write-Host "Не удалось подключиться к $Addr`:$Port. Сервер запущен? Брандмауэр открыт?" -ForegroundColor Red; exit 1 }

$p = Pkt 1 3 $Pass; $s.Write($p, 0, $p.Length)
do { $r = Read-Pkt $s } while ($r.Type -ne 2)
if ($r.Id -eq -1) { Write-Host 'Неверный rcon_password (см. cfg\server.cfg).' -ForegroundColor Red; exit 1 }

Write-Host "Подключено к $Addr`:$Port. Пишите команды сервера (bot_add_t, changelevel de_nuke, mp_warmup_end...). Выход: пустая строка." -ForegroundColor Green
$id = 10
while ($true) {
    $cmd = Read-Host '>'
    if (-not $cmd) { break }
    $p = Pkt $id 2 $cmd; $s.Write($p, 0, $p.Length); $id++
    try { (Read-Pkt $s).Body } catch { Write-Host '(сервер не ответил)' }
}
$c.Close()
