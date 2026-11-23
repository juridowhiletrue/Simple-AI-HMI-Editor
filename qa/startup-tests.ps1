# Isolated starter tests: all transports, processes, delays and filesystem writes are mocked.
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$starter = Join-Path $appRoot 'Start-HMI-Draft.ps1'
$wrapper = Join-Path $appRoot 'Start-Simple-AI-HMI-Editor.ps1'
$checks = [System.Collections.Generic.List[string]]::new()

function Assert-True { param($Condition, [string]$Message) if (-not $Condition) { throw $Message } }
function Check { param([string]$Name, [scriptblock]$Body) & $Body; $checks.Add($Name) }
function Assert-Throws {
    param([scriptblock]$Body, [string]$Pattern)
    $caught = $null
    try { & $Body | Out-Null } catch { $caught = $_ }
    Assert-True ($null -ne $caught) 'Die erwartete Ablehnung blieb aus.'
    Assert-True ($caught.Exception.Message -match $Pattern) ('Unerwarteter Fehler: ' + $caught.Exception.Message)
}

Check 'Beide Starter lassen sich ohne Ausfuehrung parsen' {
    foreach ($file in @($starter, $wrapper)) {
        $tokens = $null; $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors) | Out-Null
        Assert-True ($parseErrors.Count -eq 0) ('Syntaxfehler in ' + $file)
    }
}

. $starter
$script:actualEndpoint = (Get-Command Get-SimpleAIHMIDraftEndpoint).ScriptBlock
$script:actualPortProbe = (Get-Command Test-SimpleAIHMIPort).ScriptBlock
$script:fixtureRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) 'Simple-AI-HMI-Editor QA app'))
$script:identity = [pscustomobject]@{ appRoot=$script:fixtureRoot; workspaceRoot=(Join-Path $script:fixtureRoot 'workspaces/private-qa'); workspaceId='qa-workspace'; product='Simple-AI-HMI-Editor' }

function State-For {
    param([string]$AppPath=$script:identity.appRoot, [string]$WorkspacePath=$script:identity.workspaceRoot, [string]$WorkspaceId=$script:identity.workspaceId, [string]$Product='Simple-AI-HMI-Editor')
    return [pscustomobject]@{ adapter=[pscustomobject]@{productName=$Product}; runtime=[pscustomobject]@{appRoot=$AppPath; workspaceRoot=$WorkspacePath; workspaceId=$WorkspaceId} }
}
function Probe-For { param($State, [bool]$Reachable=$true, [string]$ErrorText) return [pscustomobject]@{Reachable=$Reachable; State=$State; Error=$ErrorText} }
function Reset-Mocks {
    $script:probes = [System.Collections.Generic.Queue[object]]::new()
    $script:launches = [System.Collections.Generic.List[object]]::new()
    $script:created = [System.Collections.Generic.List[string]]::new()
    $script:sleeps = 0
    $env:HMI_DRAFT_PORT = '8250'
}
function Get-SimpleAIHMIRuntimeInfo {
    param([string]$AppRoot)
    Assert-True ($AppRoot -eq $script:fixtureRoot) 'Der Starter verwendete den falschen App-Ordner.'
    return [pscustomobject]@{NodeExecutable='qa-never-launch-node.exe'; Identity=$script:identity}
}
function Get-SimpleAIHMIDraftEndpoint {
    param([string]$Url, [int]$Port)
    Assert-True ($Port -eq 8250 -and $Url -eq 'http://127.0.0.1:8250/') 'Falscher lokaler Endpunkt.'
    Assert-True ($script:probes.Count -gt 0) 'Unerwartete weitere Endpunktabfrage.'
    return $script:probes.Dequeue()
}
function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, $ArgumentList, [string]$WorkingDirectory, [string]$WindowStyle, [string]$RedirectStandardOutput, [string]$RedirectStandardError)
    $script:launches.Add(@{} + $PSBoundParameters)
}
function Start-SimpleAIHMIBackgroundServer {
    param([string]$Node, [string]$AppRoot)
    $script:launches.Add(@{FilePath=$Node; WorkingDirectory=$AppRoot; BackgroundServer=$true})
}
function New-Item {
    [CmdletBinding()]
    param([string]$ItemType, [string]$Path, [switch]$Force)
    Assert-True ($ItemType -eq 'Directory' -and $Force) 'Unerwarteter Dateisystemauftrag.'
    $script:created.Add($Path)
}
function Start-Sleep { param([int]$Milliseconds) $script:sleeps++ }

$priorPort = $env:HMI_DRAFT_PORT
try {
    Check 'Passende Instanz: NoBrowser liefert Runtime ohne Start' {
        Reset-Mocks
        $script:probes.Enqueue((Probe-For (State-For)))
        $runtime = Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser | ConvertFrom-Json
        Assert-True ($script:launches.Count -eq 0 -and $script:created.Count -eq 0) 'Passende Instanz loeste einen Start/Schreibauftrag aus.'
        Assert-True ($runtime.serverReady -and $runtime.reusedServer -and -not $runtime.browserOpened) 'Runtime-Status falsch.'
        Assert-True ($runtime.workspaceRoot -eq $script:identity.workspaceRoot -and $runtime.workspaceId -eq $script:identity.workspaceId) 'Workspace fehlt im Runtime-JSON.'
    }
    Check 'Doppelklick-Rueckfallweg oeffnet nur gepruefte URL' {
        Reset-Mocks
        $script:probes.Enqueue((Probe-For (State-For)))
        Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot | Out-Null
        Assert-True ($script:launches.Count -eq 1 -and $script:launches[0].FilePath -eq 'http://127.0.0.1:8250/') 'Rueckfallweg startete nicht ausschliesslich den Browser.'
    }
    foreach ($mismatch in @('app','workspace','id','product')) {
        Check ('Belegter Port mit abweichender Identitaet: ' + $mismatch) {
            Reset-Mocks
            $state = State-For
            switch ($mismatch) {
                app { $state.runtime.appRoot += '-other' }
                workspace { $state.runtime.workspaceRoot += '-other' }
                id { $state.runtime.workspaceId = 'other-workspace' }
                product { $state.adapter.productName = 'Other Service' }
            }
            $script:probes.Enqueue((Probe-For $state))
            Assert-Throws { Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser } 'anderer Dienst'
            Assert-True ($script:launches.Count -eq 0 -and $script:created.Count -eq 0) 'Identitaetsfehler wurde als Anlass fuer einen zweiten Start behandelt.'
        }
    }
    Check 'Belegter Port mit ungueltiger Antwort startet nichts' {
        Reset-Mocks
        $script:probes.Enqueue((Probe-For $null -ErrorText 'Ungueltige Antwort.'))
        Assert-Throws { Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser } 'Kein weiterer Serverstart'
        Assert-True ($script:launches.Count -eq 0) 'Ungueltige Antwort loeste einen Prozessstart aus.'
    }
    Check 'Freier Port: genau ein versteckter Server im richtigen Workspace' {
        Reset-Mocks
        $script:probes.Enqueue((Probe-For $null -Reachable $false))
        $script:probes.Enqueue((Probe-For (State-For)))
        $runtime = Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser | ConvertFrom-Json
        Assert-True ($script:launches.Count -eq 1 -and $script:launches[0].FilePath -eq 'qa-never-launch-node.exe') 'Es wurde nicht genau ein Serverstart angefordert.'
        $launch = $script:launches[0]
        Assert-True ($launch.BackgroundServer -and $launch.WorkingDirectory -eq $script:fixtureRoot) 'Hintergrundstart mit falschem App-Pfad.'
        $dataPath = Join-Path $script:identity.workspaceRoot 'data'
        Assert-True ($script:created.Count -eq 1 -and $script:created[0] -eq $dataPath) 'Laufzeitverzeichnis liegt nicht im Workspace.'
        Assert-True ($runtime.serverReady -and -not $runtime.reusedServer -and -not $runtime.browserOpened) 'Runtime eines neuen Starts falsch.'
    }
    Check 'Verspaetete Fremdantwort fuehrt niemals zu zweitem Start' {
        Reset-Mocks
        $script:probes.Enqueue((Probe-For $null -Reachable $false))
        $script:probes.Enqueue((Probe-For (State-For -WorkspaceId 'other')))
        Assert-Throws { Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser } 'anderer Dienst'
        Assert-True ($script:launches.Count -eq 1) 'Nach Fremdantwort wurde weiterer Prozess gestartet.'
    }
    Check 'Start-Timeout oeffnet keinen Browser und startet nicht erneut' {
        Reset-Mocks
        1..16 | ForEach-Object { $script:probes.Enqueue((Probe-For $null -Reachable $false)) }
        Assert-Throws { Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser } 'konnte nicht'
        Assert-True ($script:launches.Count -eq 1 -and $script:sleeps -eq 15) 'Timeout loeste weitere Prozesse aus.'
    }
    Check 'Ungueltiger Port scheitert vor Prozess-/Dateisystemauftrag' {
        Reset-Mocks
        $env:HMI_DRAFT_PORT = '0'
        Assert-Throws { Invoke-SimpleAIHMIEditor -AppRoot $script:fixtureRoot -NoBrowser } 'zwischen 1 und 65535'
        Assert-True ($script:launches.Count -eq 0 -and $script:created.Count -eq 0) 'Ungueltiger Port loeste einen Start aus.'
    }

    $script:mayListen=$true
    function Test-SimpleAIHMIListener { param([int]$Port) return $script:mayListen }
    Check 'Freier lokaler Port ueberspringt Verbindungswartezeiten' {
        $script:mayListen=$false
        try {
            $probe = & $script:actualEndpoint -Url 'http://127.0.0.1:8250/' -Port 8250
            Assert-True (-not $probe.Reachable -and -not $probe.Error) 'Freier Port falsch klassifiziert.'
        } finally { $script:mayListen=$true }
    }
    function Invoke-WebRequest {
        [CmdletBinding()]
        param([string]$Uri, [switch]$UseBasicParsing, [int]$TimeoutSec)
        if ($script:requestMode -eq 'throw') { throw 'synthetic transport failure' }
        if ($script:requestMode -eq 'invalid') { return [pscustomobject]@{Content='<html>different service</html>'} }
        return [pscustomobject]@{Content='{"adapter":{"productName":"Simple-AI-HMI-Editor"},"runtime":{"workspaceId":"qa"}}'}
    }
    function Test-SimpleAIHMIPort { param([int]$Port) $script:portChecks++; return $script:portOccupied }
    Check 'Transportprobe: gueltiges JSON gilt als erreichbar' {
        $script:requestMode='json'; $script:portChecks=0
        $probe = & $script:actualEndpoint -Url 'http://127.0.0.1:8250/' -Port 8250
        Assert-True ($probe.Reachable -and -not $probe.Error -and $probe.State.runtime.workspaceId -eq 'qa' -and $script:portChecks -eq 0) 'Gueltige Antwort wurde falsch klassifiziert.'
    }
    Check 'Transportprobe: fremdes HTML bleibt erreichbar, nicht freier Port' {
        $script:requestMode='invalid'; $script:portChecks=0
        $probe = & $script:actualEndpoint -Url 'http://127.0.0.1:8250/' -Port 8250
        Assert-True ($probe.Reachable -and $probe.Error -and $script:portChecks -eq 0) 'Fehlerhaftes JSON wurde als Nichterreichbarkeit behandelt.'
    }
    Check 'Transportprobe: belegter Port ohne Editorantwort bleibt belegt' {
        $script:requestMode='throw'; $script:portOccupied=$true; $script:portChecks=0
        $probe = & $script:actualEndpoint -Url 'http://127.0.0.1:8250/' -Port 8250
        Assert-True ($probe.Reachable -and $probe.Error -and $script:portChecks -eq 1) 'Belegter Port wurde als frei behandelt.'
    }
    Check 'Transportprobe: bestaetigt freier Port erlaubt Startpfad' {
        $script:requestMode='throw'; $script:portOccupied=$false; $script:portChecks=0
        $probe = & $script:actualEndpoint -Url 'http://127.0.0.1:8250/' -Port 8250
        Assert-True (-not $probe.Reachable -and -not $probe.Error -and $script:portChecks -eq 1) 'Bestaetigte Nichterreichbarkeit wurde falsch behandelt.'
    }
    function New-Object {
        [CmdletBinding()]
        param([Parameter(Position=0)][string]$TypeName)
        Assert-True ($TypeName -eq 'System.Net.Sockets.TcpClient') 'Unerwarteter Objekttyp.'
        return $script:fakeClient
    }
    function Set-PortFixture {
        param([string]$Mode)
        $script:tcpMode=$Mode; $script:waitMilliseconds=0; $script:disposed=0
        $script:fakePending=[pscustomobject]@{}
        $script:fakePending | Add-Member ScriptMethod Wait {
            param([int]$Milliseconds)
            $script:waitMilliseconds=$Milliseconds
            if ($script:tcpMode -eq 'refused') { throw [System.Net.Sockets.SocketException]::new([int][System.Net.Sockets.SocketError]::ConnectionRefused) }
            return ($script:tcpMode -eq 'connected')
        }
        $script:fakeClient=[pscustomobject]@{Connected=($Mode -eq 'connected')}
        $script:fakeClient | Add-Member ScriptMethod ConnectAsync { param([string]$HostName, [int]$Port) return $script:fakePending }
        $script:fakeClient | Add-Member ScriptMethod Dispose { $script:disposed++ }
    }
    Check 'TCP-Probe wartet begrenzt 3000 ms und entsorgt Verbindung' {
        Set-PortFixture 'connected'
        $connected = & $script:actualPortProbe -Port 8250
        Assert-True ($connected -and $script:waitMilliseconds -eq 3000 -and $script:disposed -eq 1) 'TCP-Prueffrist oder Aufraeumen falsch.'
    }
    Check 'TCP-Timeout bleibt unbekannt und verbietet weiteren Serverstart' {
        Set-PortFixture 'timeout'
        Assert-Throws { & $script:actualPortProbe -Port 8250 } 'kein weiterer Server'
        Assert-True ($script:waitMilliseconds -eq 3000 -and $script:disposed -eq 1) 'TCP-Timeout wurde nicht begrenzt/aufgeraeumt.'
    }
    Check 'Nur ausdrueckliches ConnectionRefused gilt als freier TCP-Port' {
        Set-PortFixture 'refused'
        $connected = & $script:actualPortProbe -Port 8250
        Assert-True (-not $connected -and $script:disposed -eq 1) 'ConnectionRefused wurde nicht als freier Port erkannt.'
    }
    [ordered]@{passed=$true; checks=$checks.Count; scope='isolated-starter-mocks'; realProcessStarts=0; realNetworkCalls=0; realFilesystemWrites=0} | ConvertTo-Json -Compress
} finally {
    $env:HMI_DRAFT_PORT = $priorPort
}
