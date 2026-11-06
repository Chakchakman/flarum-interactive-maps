# PowerShell 5.1+, synthetic files and command stubs; no Docker/database is accessed.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('maps backup fixture ' + [guid]::NewGuid())
$originalLocation = (Get-Location).Path
New-Item -ItemType Directory -Path (Join-Path $fixture 'extension') -Force | Out-Null
Set-Content (Join-Path $fixture 'docker-compose.yml') 'services: {}'
Set-Content (Join-Path $fixture 'extension/preserved.txt') 'local edits must survive'
$global:backupTestMode = ''
$global:backupTestCalls = @()
function git {
    $global:LASTEXITCODE = 0
    $global:backupTestCalls += 'git ' + ($args -join ' ')
    if ($args -contains 'rev-parse') { return ('e' * 40) }
    return ' M js/dist/forum.js'
}
function docker {
    $global:LASTEXITCODE = 0
    $line = $args -join ' '
    $global:backupTestCalls += 'docker ' + $line
    if (($global:backupTestMode -eq 'config' -and $args -contains 'config') -or
        ($global:backupTestMode -eq 'dump' -and $args -contains 'sh')) {
        $global:LASTEXITCODE = 17; return
    }
    if ($args -contains 'ps') {
        if ($global:backupTestMode -eq 'servicesdown') { return 'app' }
        return @('app', 'db')
    }
    if ($args -contains 'php') {
        if ($global:backupTestMode -eq 'metadata') { return '<unexpected output>' }
        return 'ZmxhcnVtX3Rlc3Q='
    }
    $index = [Array]::IndexOf([object[]]$args, 'cp')
    if ($index -ge 0) {
        $source = [string]$args[$index + 1]; $destination = [string]$args[$index + 2]
        if ($source.StartsWith('db:/tmp/')) {
            if ($global:backupTestMode -eq 'copySQL') { $global:LASTEXITCODE = 17; return }
            [IO.File]::WriteAllText($destination, "-- synthetic dump`n-- Dump completed on test`n")
        } elseif ($source.StartsWith('app:/tmp/')) {
            [IO.File]::WriteAllText($destination, $(if ($global:backupTestMode -eq 'emptyfile') { '' } else { 'synthetic archive' }))
        }
    }
}
function tar.exe {
    $global:LASTEXITCODE = 0
    $global:backupTestCalls += 'tar.exe ' + ($args -join ' ')
    if ($global:backupTestMode -eq 'archive' -and $args -contains '-tzf') { $global:LASTEXITCODE = 17; return }
    $index = [Array]::IndexOf([object[]]$args, '-czf')
    if ($index -ge 0) { [IO.File]::WriteAllText([string]$args[$index + 1], 'synthetic source archive') }
}
try {
    $script = Join-Path $PSScriptRoot '../scripts/Backup-Lab.ps1'
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw ($errors | Out-String) }
    & $script -LabPath $fixture
    $complete = @(Get-ChildItem -Path (Join-Path $fixture '_backups/*/BACKUP-COMPLETE.txt'))
    if ($complete.Count -ne 1) { throw 'Exactly one complete backup is required.' }
    $backup = $complete[0].Directory.FullName
    $checksums = @(Get-Content -Raw (Join-Path $backup 'checksums.json') | ConvertFrom-Json)
    if ($checksums.Count -ne 3) { throw 'Missing backup manifest entries.' }
    foreach ($entry in $checksums) {
        if ($entry.Length -le 0 -or $entry.SHA256 -ne (Get-FileHash (Join-Path $backup $entry.Name)).Hash) { throw 'Backup checksum mismatch.' }
    }
    if ([IO.File]::ReadAllText((Join-Path $backup 'dump-database.sh')).Contains("`r")) { throw 'Shell payload must have Unix line endings.' }
    if ((Get-Location).Path -ne $originalLocation) { throw 'Location was not restored.' }
    foreach ($mode in @('config', 'servicesdown', 'metadata', 'dump', 'copySQL', 'archive', 'emptyfile')) {
        $global:backupTestMode = $mode; $global:backupTestCalls = @(); $caught = $false
        try { & $script -LabPath $fixture } catch { $caught = $true }
        if (-not $caught) { throw "Ignored failure: $mode" }
        if (@(Get-ChildItem -Path (Join-Path $fixture '_backups/*/BACKUP-COMPLETE.txt')).Count -ne 1) { throw "Marked incomplete backup complete: $mode" }
        if ((Get-Location).Path -ne $originalLocation) { throw "Location not restored after $mode" }
        if (($global:backupTestCalls -join "`n") -match '\b(migrate|restart|down|switch|stash|reset)\b') { throw 'A backup must not mutate checkout, services or schema.' }
        if ((Get-Content -Raw (Join-Path $fixture 'extension/preserved.txt')).Trim() -ne 'local edits must survive') { throw 'Existing source was changed.' }
    }
    $global:LASTEXITCODE = 0
    Write-Host 'Backup orchestration, private metadata, manifests and seven failure paths passed.'
}
finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Remove-Item Function:docker, Function:git, Function:tar.exe
    Remove-Variable backupTestMode, backupTestCalls -Scope Global
}
