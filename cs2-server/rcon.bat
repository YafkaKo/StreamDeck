@chcp 866 >nul
@echo off
rem Пульт админа сервера через rcon. Адрес берётся из settings.bat, пароль из cfg\server.cfg.
call "%~dp0settings.bat"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rcon.ps1" -Addr %SERVER_IP% -Port %GAME_PORT%
pause
