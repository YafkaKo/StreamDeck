@chcp 866 >nul
@echo off
rem Устанавливает SteamCMD и выделенный сервер CS2. Повторный запуск = обновление сервера.
call "%~dp0settings.bat"

if not exist "%STEAMCMD_DIR%\steamcmd.exe" (
    echo Скачиваю SteamCMD в %STEAMCMD_DIR% ...
    mkdir "%STEAMCMD_DIR%" 2>nul
    powershell -NoProfile -Command "Invoke-WebRequest 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile '%STEAMCMD_DIR%\steamcmd.zip'; Expand-Archive -Force '%STEAMCMD_DIR%\steamcmd.zip' '%STEAMCMD_DIR%'" || goto :fail
)

echo Скачиваю/обновляю сервер CS2 в %SERVER_DIR% (около 60 ГБ, это долго)...
"%STEAMCMD_DIR%\steamcmd.exe" +force_install_dir "%SERVER_DIR%" +login anonymous +app_update 730 validate +quit
if not exist "%SERVER_DIR%\game\bin\win64\cs2.exe" goto :fail
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
