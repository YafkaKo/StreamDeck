@echo off
rem Everything on ONE PC: CS2 server + HUD server.
rem Two PCs (recommended): on the server PC run cs2-server\start-server.bat,
rem on the HUD/OBS PC run start.bat and enter the server address in the pult.
rem Only ASCII here: Cyrillic in .bat files breaks cmd.exe.
cd /d "%~dp0"
start "CS2 server" cmd /c "cs2-server\start-server.bat"
start "HUD server" cmd /c "start.bat"
rem Pult: http://localhost:3000/control.html  (tab "Server CS2")
