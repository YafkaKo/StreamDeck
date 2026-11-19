@chcp 866 >nul
@echo off
rem Панель админа в браузере: кнопки вместо команд. Окно не закрывать, пока панель нужна.
call "%~dp0settings.bat"
where node >nul 2>&1 || (echo Нужен Node.js. Скачайте LTS с https://nodejs.org, установите и запустите panel.bat снова. & pause & exit /b 1)
start "" http://localhost:8080
node "%~dp0panel\server.js"
pause
