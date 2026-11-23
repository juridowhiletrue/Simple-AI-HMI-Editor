@echo off
powershell.exe -NoProfile -File "%~dp0Start-HMI-Draft.ps1"
if errorlevel 1 pause
