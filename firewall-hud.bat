@echo off
rem HUD PC: allow the phone pult, other PCs and MatchZy events (from the CS2 server PC) to reach the HUD.
rem Run once, right click - "Run as administrator". Only ASCII here.
net session >nul 2>&1
if errorlevel 1 (
  echo Run this file as administrator: right click - Run as administrator.
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="Arena HUD 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Arena HUD 3000" dir=in action=allow protocol=TCP localport=3000 profile=any
echo.
echo Done: TCP port 3000 is open for the HUD.
pause
