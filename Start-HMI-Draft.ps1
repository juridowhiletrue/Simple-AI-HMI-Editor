param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$script:SmartHmiStarterRoot = $PSScriptRoot

function Test-SmartHMIPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $pending.Wait(3000)) { throw 'Der lokale Portstatus ist wegen einer Zeitueberschreitung unbekannt.' }
        return $client.Connected
    } catch {
        $socketFailure = $_.Exception
        while ($socketFailure.InnerException) { $socketFailure = $socketFailure.InnerException }
        if ($socketFailure -is [System.Net.Sockets.SocketException] -and $socketFailure.SocketErrorCode -eq [System.Net.Sockets.SocketError]::ConnectionRefused) { return $false }
        throw ('Der lokale Port konnte nicht sicher geprueft werden. Es wird kein weiterer Server gestartet. ' + $socketFailure.Message)
    } finally {
        $client.Dispose()
    }
}

function Test-SmartHMIListener {
    param([int]$Port)
    try {
        foreach ($listener in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()) {
            if ($listener.Port -eq $Port) { return $true }
        }
        return $false
    } catch {
        return $true # If the listener table is unavailable, use the bounded HTTP/TCP probes.
    }
}

function Get-SmartHMIDraftEndpoint {
    param([string]$Url, [int]$Port)
    if (-not (Test-SmartHMIListener -Port $Port)) {
        return [pscustomobject]@{ Reachable=$false; State=$null; Error=$null }
    }
    try {
        $response = Invoke-WebRequest -Uri ($Url + 'draft/state') -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    } catch {
        if ($_.Exception.Response) {
            return [pscustomobject]@{ Reachable=$true; State=$null; Error='Der Port antwortet mit einem HTTP-Fehler.' }
        }
        if (Test-SmartHMIPort -Port $Port) {
            return [pscustomobject]@{ Reachable=$true; State=$null; Error='Der Port ist belegt, liefert aber keine gueltige Editorantwort.' }
        }
        return [pscustomobject]@{ Reachable=$false; State=$null; Error=$null }
    }
    try {
        $state = $response.Content | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return [pscustomobject]@{ Reachable=$true; State=$null; Error='Der Port antwortet, aber nicht mit gueltigen Editor-JSON-Daten.' }
    }
    return [pscustomobject]@{ Reachable=$true; State=$state; Error=$null }
}

function Get-SmartHMIRuntimeInfo {
    param([string]$AppRoot)
    $nodeCommand = Get-Command node -ErrorAction Stop
    $LASTEXITCODE = 0
    $runtimeJson = & $nodeCommand.Source (Join-Path $AppRoot 'lib/runtime-info.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'App- und Workspace-Zuordnung konnten nicht ermittelt werden.' }
    $identity = $runtimeJson | ConvertFrom-Json -ErrorAction Stop
    if (-not $identity.appRoot -or -not $identity.workspaceRoot) { throw 'Die ermittelte App-/Workspace-Zuordnung ist unvollstaendig.' }
    return [pscustomobject]@{ NodeExecutable=$nodeCommand.Source; Identity=$identity }
}

function Assert-SmartHMIIdentity {
    param($Probe, $Expected, [int]$Port)
    if ($Probe.Error) { throw ($Probe.Error + ' Kein weiterer Serverstart; bitte den belegten Port ' + $Port + ' klaeren oder bewusst einen anderen Port verwenden.') }
    $state = $Probe.State
    $matches = $state.adapter.productName -eq 'Smart HMI Editor' -and $state.runtime.appRoot -eq $Expected.appRoot -and $state.runtime.workspaceRoot -eq $Expected.workspaceRoot
    if ($Expected.workspaceId) { $matches = $matches -and $state.runtime.workspaceId -eq $Expected.workspaceId }
    if (-not $matches) {
        throw ('Auf Port ' + $Port + ' antwortet ein anderer Dienst, Editor oder Arbeitsbereich. Kein weiterer Server wird gestartet und kein falscher Arbeitsbereich geoeffnet.')
    }
}

function Start-SmartHMIBackgroundServer {
    param([string]$Node, [string]$AppRoot)
    $helper = Join-Path $AppRoot 'lib/runtime-info.cjs'
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Node
    $start.Arguments = ('"' + $helper + '" --start-server')
    $start.WorkingDirectory = $AppRoot
    $start.UseShellExecute = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $launcher = [Diagnostics.Process]::Start($start)
    $launcher.Dispose()
}

function Invoke-SmartHMIEditor {
    param([string]$AppRoot=$script:SmartHmiStarterRoot, [switch]$NoBrowser)
    $draftRoot = [System.IO.Path]::GetFullPath($AppRoot)
    $draftPort = if ($env:HMI_DRAFT_PORT) { [int]$env:HMI_DRAFT_PORT } else { 8250 }
    if ($draftPort -lt 1 -or $draftPort -gt 65535) { throw 'HMI_DRAFT_PORT muss zwischen 1 und 65535 liegen.' }
    $draftUrl = 'http://127.0.0.1:' + $draftPort + '/'
    $resolved = Get-SmartHMIRuntimeInfo -AppRoot $draftRoot
    $expected = $resolved.Identity
    $probe = Get-SmartHMIDraftEndpoint -Url $draftUrl -Port $draftPort
    $reused = [bool]$probe.Reachable
    $ready = $false
    if ($probe.Reachable) {
        # Identity errors deliberately live outside transport error handling.
        Assert-SmartHMIIdentity -Probe $probe -Expected $expected -Port $draftPort
        $ready = $true
    } else {
        $draftData = Join-Path $expected.workspaceRoot 'data'
        New-Item -ItemType Directory -Path $draftData -Force | Out-Null
        Start-SmartHMIBackgroundServer -Node $resolved.NodeExecutable -AppRoot $draftRoot
        for ($draftAttempt=0; $draftAttempt -lt 15; $draftAttempt++) {
            $probe = Get-SmartHMIDraftEndpoint -Url $draftUrl -Port $draftPort
            if ($probe.Reachable) {
                Assert-SmartHMIIdentity -Probe $probe -Expected $expected -Port $draftPort
                $ready=$true
                break
            }
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $ready) { throw 'Smart HMI Editor konnte nicht mit dem gewuenschten Workspace gestartet werden. Details in dessen data/server.stderr.txt.' }
    $runtime = [ordered]@{ product='Smart HMI Editor'; url=$draftUrl; port=$draftPort; appRoot=$expected.appRoot; workspaceRoot=$expected.workspaceRoot; workspaceId=$probe.State.runtime.workspaceId; serverReady=$true; reusedServer=$reused; browserOpened=(-not $NoBrowser) }
    if ($NoBrowser) {
        $runtime | ConvertTo-Json -Compress
    } else {
        Start-Process -FilePath $draftUrl
        Write-Output ('Smart HMI Editor bereit: ' + $draftUrl)
    }
}

# Dot-sourcing only defines helpers for isolated tests; it never starts anything.
if ($MyInvocation.InvocationName -ne '.') { Invoke-SmartHMIEditor -NoBrowser:$NoBrowser }
