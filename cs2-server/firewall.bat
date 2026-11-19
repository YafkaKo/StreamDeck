@chcp 866 >nul
@echo off
rem Открывает порты сервера в брандмауэре Windows. Запускать ПКМ -> "Запуск от имени администратора".
call "%~dp0settings.bat"

net session >nul 2>&1 || (echo Нужен запуск от имени администратора. & pause & exit /b 1)

netsh advfirewall firewall delete rule name="CS2 Server" >nul 2>&1
netsh advfirewall firewall add rule name="CS2 Server" dir=in action=allow protocol=UDP localport=%GAME_PORT%,%TV_PORT%
netsh advfirewall firewall add rule name="CS2 Server" dir=in action=allow protocol=TCP localport=%GAME_PORT%,8080
netsh advfirewall firewall add rule name="CS2 Server" dir=in action=allow program="%SERVER_DIR%\game\bin\win64\cs2.exe"

echo Правила "CS2 Server" добавлены.
pause
