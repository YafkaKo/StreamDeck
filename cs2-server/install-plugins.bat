@chcp 866 >nul
@echo off
rem Ставит/обновляет моды турнирного режима (MatchZy). Сервер должен быть закрыт.
call "%~dp0settings.bat"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-plugins.ps1"
pause
