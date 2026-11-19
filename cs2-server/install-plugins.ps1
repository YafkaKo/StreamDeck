# Моды для турнирного режима: Metamod:Source + CounterStrikeSharp + MatchZy (нож-раунд, !ready, !pause, откат раунда).
#   без параметров  - скачать свежие версии и установить (повторный запуск = обновление модов)
#   -PatchOnly      - только прописать Metamod в gameinfo.gi (CS2 стирает эту строку при каждом обновлении)
#   -Disable        - убрать строку из gameinfo.gi: сервер запустится без модов
param([switch]$PatchOnly, [switch]$Disable)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = 'Tls12'

$serverDir = if ($env:SERVER_DIR) { $env:SERVER_DIR } else { 'C:\CS2Server' }
$csgo = Join-Path $serverDir 'game\csgo'
$gameinfo = Join-Path $csgo 'gameinfo.gi'
$mmLine = "`t`t`tGame`tcsgo/addons/metamod"

function Set-Metamod([bool]$on) {
    $text = [IO.File]::ReadAllText($gameinfo)
    $has = $text -match 'csgo/addons/metamod'
    if ($on -and -not $has) {
        # Metamod должен стоять первым в списке путей, до Game_LowViolence / Game csgo.
        $text = [regex]::Replace($text, '(\r?\n)(\s*Game_LowViolence)', "`$1$mmLine`$1`$2", 1)
        if ($text -notmatch 'csgo/addons/metamod') { throw "Не нашёл, куда вписать Metamod в $gameinfo" }
    } elseif (-not $on -and $has) {
        $text = [regex]::Replace($text, '\r?\n[^\r\n]*csgo/addons/metamod[^\r\n]*', '')
    } else { return }
    [IO.File]::WriteAllText($gameinfo, $text)
}

if (-not (Test-Path $gameinfo)) { Write-Host "Сервер не найден в $serverDir. Сначала install.bat." -ForegroundColor Red; exit 1 }

if ($Disable) { Set-Metamod $false; Write-Host 'Моды выключены (сервер запустится без MatchZy).'; exit 0 }
if ($PatchOnly) {
    if (Test-Path (Join-Path $csgo 'addons\metamod')) { Set-Metamod $true }
    exit 0
}

if (Get-CimInstance Win32_Process -Filter "name='cs2.exe'" | Where-Object { $_.CommandLine -match '-dedicated' }) {
    Write-Host 'Сервер CS2 запущен. Закройте окно "CS2 Server" и запустите установку снова.' -ForegroundColor Red; exit 1
}

$tmp = Join-Path $env:TEMP ("cs2-plugins-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null
try {
    $mmName = (Invoke-WebRequest 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-latest-windows' -UseBasicParsing).Content
    if ($mmName -is [byte[]]) { $mmName = [Text.Encoding]::ASCII.GetString($mmName) }
    $mmName = $mmName.Trim()
    if ($mmName -notmatch '^mmsource-[\w.\-]+-windows\.zip$') { throw "Неожиданный ответ сайта Metamod: $mmName" }

    $gh = @{ 'User-Agent' = 'cs2-lan-kit' }
    # CounterStrikeSharp ставим отдельно, самый свежий: версия из комплекта MatchZy бывает старше CS2 и роняет сервер.
    $css = Invoke-RestMethod 'https://api.github.com/repos/roflmuffin/CounterStrikeSharp/releases/latest' -Headers $gh
    $cssZip = $css.assets | Where-Object name -like 'counterstrikesharp-with-runtime-windows-*.zip' | Select-Object -First 1
    $rel = Invoke-RestMethod 'https://api.github.com/repos/shobhit-pathak/MatchZy/releases/latest' -Headers $gh
    $mz = $rel.assets | Where-Object { $_.name -match '^MatchZy-[\d.]+\.zip$' } | Select-Object -First 1
    if (-not $cssZip -or -not $mz) { throw 'Не нашёл архивы CounterStrikeSharp/MatchZy для Windows в свежих релизах' }

    Write-Host "Скачиваю $mmName ..."
    Invoke-WebRequest "https://mms.alliedmods.net/mmsdrop/2.0/$mmName" -OutFile "$tmp\mm.zip" -UseBasicParsing
    Write-Host "Скачиваю CounterStrikeSharp $($css.tag_name) (~50 МБ) ..."
    Invoke-WebRequest $cssZip.browser_download_url -OutFile "$tmp\css.zip" -UseBasicParsing
    Write-Host "Скачиваю MatchZy $($rel.tag_name) ..."
    Invoke-WebRequest $mz.browser_download_url -OutFile "$tmp\mz.zip" -UseBasicParsing

    Write-Host "Распаковываю в $csgo ..."
    Expand-Archive "$tmp\mm.zip" $csgo -Force
    Expand-Archive "$tmp\css.zip" $csgo -Force
    Expand-Archive "$tmp\mz.zip" $csgo -Force
    Set-Metamod $true
    Write-Host "Готово: $mmName, CounterStrikeSharp $($css.tag_name), MatchZy $($rel.tag_name). Запускайте start-server.bat." -ForegroundColor Green
} catch {
    Write-Host "ОШИБКА: $($_.Exception.Message)" -ForegroundColor Red; exit 1
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
