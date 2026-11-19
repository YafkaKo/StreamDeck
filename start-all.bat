@echo off
rem Tournament day on one PC: CS2 server + HUD server.
rem Only ASCII here: Cyrillic in .bat files breaks cmd.exe.
cd /d "%~dp0"
start "CS2 server" cmd /c "cs2-server\start-server.bat"
start "HUD server" cmd /c "start.bat"
rem Pult: http://localhost:3000/control.html  (tab "Server CS2")
