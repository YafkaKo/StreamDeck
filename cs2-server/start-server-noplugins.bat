@chcp 866 >nul
@echo off
rem Запасной запуск БЕЗ модов (если после обновления CS2 сервер с MatchZy не стартует).
rem Нож-раунда и !ready не будет: матч стартует кнопкой <Начать матч> в панели или mp_warmup_end.
set "NOPLUGINS=1"
call "%~dp0start-server.bat"
