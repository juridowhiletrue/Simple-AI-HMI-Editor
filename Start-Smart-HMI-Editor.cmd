@echo off
powershell.exe -NoProfile -File "%~dp0Start-Smart-HMI-Editor.ps1"
if errorlevel 1 pause
