param([switch]$NoBrowser)
& (Join-Path $PSScriptRoot 'Start-HMI-Draft.ps1') -NoBrowser:$NoBrowser
