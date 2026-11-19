@chcp 866 >nul
@echo off
rem Копирует турнирные конфиги и запускает сервер. Окно консоли сервера = пульт админа.
call "%~dp0settings.bat"

if not exist "%SERVER_DIR%\game\bin\win64\cs2.exe" (echo Сервер не установлен. Сначала запустите install.bat. & pause & exit /b 1)

xcopy /y /s /q "%~dp0cfg" "%SERVER_DIR%\game\csgo\cfg\" >nul || (echo Не удалось скопировать конфиги. & pause & exit /b 1)
if "%NOPLUGINS%"=="1" (powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-plugins.ps1" -Disable) else (powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-plugins.ps1" -PatchOnly)

if "%SERVER_IP%"=="auto" (echo Не удалось определить IP этого ПК в сети. Проверьте кабель/Wi-Fi или впишите IP вручную в settings.bat. & pause & exit /b 1)
echo Адрес сервера: %SERVER_IP%:%GAME_PORT%   GOTV: %SERVER_IP%:%TV_PORT%
echo Команда для игроков:   connect %SERVER_IP%:%GAME_PORT%
echo.

start "CS2 Server" "%SERVER_DIR%\game\bin\win64\cs2.exe" -dedicated -console -usercon -condebug -ip %SERVER_IP% -port %GAME_PORT% -maxplayers %MAX_PLAYERS% +sv_lan 1 +game_type 0 +game_mode 1 +tv_enable 1 +tv_port %TV_PORT% +map %START_MAP%
pause
