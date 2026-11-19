@chcp 866 >nul
@echo off
rem === Общие настройки. Меняйте здесь. ===

rem SteamCMD не должен лежать внутри папки сервера. Куда ставить сервер (~60 ГБ). Не кладите в OneDrive: синхронизация забьёт сеть и диск.
set "SERVER_DIR=C:\CS2Server"
set "STEAMCMD_DIR=C:\steamcmd"

rem Стартовая карта
set "START_MAP=de_mirage"

rem Порты: игра и GOTV (для комментатора/трансляции)
set "GAME_PORT=27015"
set "TV_PORT=27020"

rem 10 игроков + комментатор + запас
set "MAX_PLAYERS=14"

rem IP этого ПК в сети арены. auto = определить самому (проводная сеть, потом Wi-Fi; WSL и VPN не берутся).
rem Если определился не тот адрес, впишите нужный вручную, например: set "SERVER_IP=192.168.0.100"
set "SERVER_IP=auto"
if "%SERVER_IP%"=="auto" for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0detect-ip.ps1"') do set "SERVER_IP=%%i"
