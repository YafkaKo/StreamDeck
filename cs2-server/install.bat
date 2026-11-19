@chcp 866 >nul
@echo off
rem Устанавливает SteamCMD и выделенный сервер CS2. Повторный запуск = обновление сервера.
call "%~dp0settings.bat"

if not exist "%STEAMCMD_DIR%\steamcmd.exe" (
    echo Скачиваю SteamCMD в %STEAMCMD_DIR% ...
    mkdir "%STEAMCMD_DIR%" 2>nul
    powershell -NoProfile -Command "Invoke-WebRequest 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile '%STEAMCMD_DIR%\steamcmd.zip'; Expand-Archive -Force '%STEAMCMD_DIR%\steamcmd.zip' '%STEAMCMD_DIR%'" || goto :fail
)

rem Запущенный сервер держит свои файлы: SteamCMD скачает обновление, но не сможет его поставить (File locked).
powershell -NoProfile -Command "$d=[IO.Path]::GetFullPath('%SERVER_DIR%'); if (Get-Process cs2 -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d, 'OrdinalIgnoreCase') }) { exit 1 }"
if errorlevel 1 (
    echo.
    echo Сервер CS2 сейчас запущен - обновить его нельзя.
    echo Закройте окно "CS2 Server" и запустите install.bat ещё раз.
    echo.
    pause
    exit /b 1
)

echo Скачиваю/обновляю сервер CS2 в %SERVER_DIR% (около 60 ГБ, это долго)...
"%STEAMCMD_DIR%\steamcmd.exe" +force_install_dir "%SERVER_DIR%" +login anonymous +app_update 730 validate +quit
if not exist "%SERVER_DIR%\game\bin\win64\cs2.exe" goto :fail
rem SteamCMD пишет "Success" только если обновление встало. Проверяем по его логу: последняя запись о 730.
powershell -NoProfile -Command "$l=Get-Content '%STEAMCMD_DIR%\logs\content_log.txt' -Tail 300 -ErrorAction SilentlyContinue; $last=$l | Where-Object { $_ -match 'AppID 730 (update canceled|scheduler finished)' } | Select-Object -Last 1; if ($last -match 'canceled|File locked|result (?!No Error)') { Write-Host $last; exit 1 }"
if errorlevel 1 (
    echo.
    echo ОШИБКА: обновление скачано, но не установлено ^(строка из лога SteamCMD выше^).
    echo Закройте сервер CS2 и всё, что может держать его файлы, и запустите install.bat ещё раз.
    echo.
    pause
    exit /b 1
)
for /f "tokens=2 delims==" %%v in ('findstr /b "PatchVersion" "%SERVER_DIR%\game\csgo\steam.inf"') do echo Версия сервера: %%v ^(в игре: консоль, команда version^)
rem Обновление CS2 стирает строку Metamod из gameinfo.gi: возвращаем (если моды ставились).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-plugins.ps1" -PatchOnly
echo ВНИМАНИЕ: если после обновления сервер с модами не стартует, запустите install-plugins.bat (свежие моды) или start-server-noplugins.bat.

echo.
echo Готово. Теперь запустите firewall.bat от имени администратора, затем start-server.bat.
pause
exit /b 0

:fail
echo.
echo ОШИБКА установки. Проверьте интернет и свободное место на диске и запустите install.bat ещё раз.
pause
exit /b 1
