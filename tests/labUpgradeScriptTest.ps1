# Synthetic local files and command stubs only; no real Docker/forum/Git is changed.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('maps upgrade fixture ' + [guid]::NewGuid())
$originalLocation = (Get-Location).Path
New-Item -ItemType Directory -Path $fixture | Out-Null
$global:upgradeTestCalls = @()
$global:upgradeTestMode = ''
$global:upgradeTestHead = ''
$global:upgradeTestStashed = $false
$global:upgradeTestFailSuffix = ''
function git {
    $global:LASTEXITCODE = 0
    $line = 'git ' + ($args -join ' '); $global:upgradeTestCalls += $line
    if ($args -contains 'status') {
        if ($global:upgradeTestMode -eq 'localchanges') { return ' M src/custom.php' }
        if (-not $global:upgradeTestStashed) { return ' M js/dist/forum.js' }
        return
    }
    if ($args -contains 'branch') {
        if ($global:upgradeTestMode -eq 'protected') { return 'main' }
        return 'test/release-hardening-e917eaa'
    }
    if ($args -contains 'stash') { $global:upgradeTestStashed = $true; return }
    if ($args -contains 'switch') { $global:upgradeTestHead = '494b41d8ee49da50d72486b961bb8053f7d6d400'; return }
    if ($args -contains 'refs/stash') { return ('a' * 40) }
    if ($args -contains '--verify') {
        if ($global:upgradeTestMode -eq 'target') { return ('f' * 40) }
        return '494b41d8ee49da50d72486b961bb8053f7d6d400'
    }
    if ($args -contains 'HEAD') { return $global:upgradeTestHead }
}
function docker {
    $global:LASTEXITCODE = 0
    $line = 'docker ' + ($args -join ' '); $global:upgradeTestCalls += $line
    if ($global:upgradeTestFailSuffix -and $line.EndsWith($global:upgradeTestFailSuffix)) { $global:LASTEXITCODE = 17; return }
    if ($args -contains 'ps') { return @('app', 'db') }
}
function Invoke-WebRequest { return [pscustomobject]@{ StatusCode = 200 } }
try {
    $script = Join-Path $PSScriptRoot '../scripts/Upgrade-EmbedUploadLab.ps1'
    $tokens = $null; $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw ($errors | Out-String) }
    $modes = @('success', 'approval', 'backuphash', 'localchanges', 'protected', 'target', 'npm ci', 'npm run check', 'composer dump-autoload --no-scripts', '--approved-after-backup', 'php flarum cache:clear', 'restart app')
    foreach ($mode in $modes) {
        $lab = Join-Path $fixture ([guid]::NewGuid().ToString('N'))
        $backup = Join-Path $lab '_backups/reviewed'
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $lab 'extension') | Out-Null
        Set-Content (Join-Path $lab 'extension/preserved.txt') 'untouched source'
        Set-Content (Join-Path $lab 'docker-compose.yml') 'services: {}'
        Set-Content (Join-Path $backup 'BACKUP-COMPLETE.txt') 'synthetic verified backup'
        Set-Content (Join-Path $backup 'HEAD.txt') 'e917eaae890be4695868ae2852f0c4f71ceb394f'
        $files = foreach ($name in @('extension.tgz', 'database.sql', 'storage.tgz')) {
            $path = Join-Path $backup $name; [IO.File]::WriteAllText($path, 'synthetic backup bytes')
            [pscustomobject]@{ Name = $name; Length = (Get-Item $path).Length; SHA256 = (Get-FileHash $path).Hash }
        }
        [IO.File]::WriteAllText((Join-Path $backup 'checksums.json'), (ConvertTo-Json -InputObject @($files)))
        if ($mode -eq 'backuphash') { Add-Content (Join-Path $backup 'database.sql') 'changed after backup' }
        $global:upgradeTestMode = $mode; $global:upgradeTestCalls = @(); $global:upgradeTestStashed = $false
        $global:upgradeTestHead = 'e917eaae890be4695868ae2852f0c4f71ceb394f'
        $global:upgradeTestFailSuffix = $(if ($mode -in @('success', 'approval', 'backuphash', 'localchanges', 'protected', 'target')) { '' } else { $mode })
        $caught = $false
        try { & $script -LabPath $lab -BackupPath '_backups/reviewed' -ApprovedEmbedMigration:($mode -ne 'approval') }
        catch { $caught = $true; if ($mode -eq 'success') { throw } }
        if ($mode -eq 'success') {
            if (-not (Test-Path (Join-Path $backup 'UPGRADE-COMPLETE.txt'))) { throw 'Missing completion marker.' }
            if (-not (Test-Path (Join-Path $backup 'UPGRADE-STASH.txt'))) { throw 'Missing recovery stash record.' }
            $migration = @($global:upgradeTestCalls | Where-Object { $_ -like '*Migrate-EmbedPresentation.php --approved-after-backup' })
            if ($migration.Count -ne 1) { throw 'Exactly one scoped migration invocation required.' }
            $calls = $global:upgradeTestCalls -join "`n"
            if ($calls -match 'php flarum migrate|\b(reset|clean|push|down)\b') { throw 'Unexpected destructive/global operation.' }
            if ($calls.IndexOf('npm run check') -ge $calls.IndexOf('Migrate-EmbedPresentation.php') -or
                $calls.IndexOf('composer dump-autoload --no-scripts') -ge $calls.IndexOf('Migrate-EmbedPresentation.php') -or
                $calls.IndexOf('Migrate-EmbedPresentation.php') -ge $calls.IndexOf('php flarum cache:clear')) { throw 'Wrong upgrade ordering.' }
        } else {
            if (-not $caught) { throw "Ignored failure: $mode" }
            if (Test-Path (Join-Path $backup 'UPGRADE-COMPLETE.txt')) { throw "False completion: $mode" }
            if ($global:upgradeTestFailSuffix -and -not $global:upgradeTestCalls[-1].EndsWith($global:upgradeTestFailSuffix)) { throw "Continued after failure: $mode" }
            if ($mode -in @('approval', 'backuphash', 'localchanges', 'protected', 'target') -and $global:upgradeTestStashed) { throw "Mutated source before validation: $mode" }
        }
        if ((Get-Location).Path -ne $originalLocation) { throw 'Working directory was not restored.' }
        if ((Get-Content -Raw (Join-Path $lab 'extension/preserved.txt')).Trim() -ne 'untouched source') { throw 'Fixture source was changed.' }
    }
    $global:LASTEXITCODE = 0
    Write-Host 'Approved upgrade success, scoped migration ordering and eleven failure guards passed.'
}
finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Remove-Item Function:docker, Function:git, Function:Invoke-WebRequest
    Remove-Variable upgradeTestCalls, upgradeTestMode, upgradeTestHead, upgradeTestStashed, upgradeTestFailSuffix -Scope Global
}
