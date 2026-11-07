#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$LabPath = (Get-Location).Path,
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [switch]$ApprovedEmbedMigration
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ApprovedEmbedMigration) { throw 'Explicit owner approval of the embed-presentation migration is required.' }
function Invoke-UpgradeNative {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE). Stop and report this step; do not reset data." }
}
$target = '494b41d8ee49da50d72486b961bb8053f7d6d400'
$baseline = 'e917eaae890be4695868ae2852f0c4f71ceb394f'
$lab = (Resolve-Path -LiteralPath $LabPath).Path
if (-not [IO.Path]::IsPathRooted($BackupPath)) { $BackupPath = Join-Path $lab $BackupPath }
$backup = (Resolve-Path -LiteralPath $BackupPath).Path
foreach ($name in @('BACKUP-COMPLETE.txt', 'HEAD.txt', 'checksums.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $backup $name) -PathType Leaf)) { throw "Backup is missing $name." }
}
if ([IO.File]::ReadAllText((Join-Path $backup 'HEAD.txt')).Trim() -ne $baseline) { throw 'Backup HEAD does not match the reviewed baseline.' }
$manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $backup 'checksums.json')))
if ($manifest.Count -ne 3 -or (($manifest.Name | Sort-Object) -join ',') -ne 'database.sql,extension.tgz,storage.tgz') {
    throw 'Unexpected backup manifest.'
}
foreach ($entry in $manifest) {
    $file = Get-Item -LiteralPath (Join-Path $backup $entry.Name)
    if ($file.Length -le 0 -or $file.Length -ne $entry.Length -or
        (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $entry.SHA256) { throw "Backup verification failed: $($entry.Name)" }
}
if (-not (Test-Path -LiteralPath (Join-Path $lab 'docker-compose.yml') -PathType Leaf)) { throw 'Missing docker-compose.yml.' }
Push-Location $lab
try {
    $dc = @('compose', '--project-directory', $lab, '-f', (Join-Path $lab 'docker-compose.yml'))
    Invoke-UpgradeNative 'docker' ($dc + @('config', '--quiet'))
    $services = @(Invoke-UpgradeNative 'docker' ($dc + @('ps', '--status', 'running', '--services')))
    if ($services -notcontains 'app' -or $services -notcontains 'db') { throw 'Both app and db must be running.' }
    $head = (Invoke-UpgradeNative 'git' @('-C', 'extension', 'rev-parse', 'HEAD')) -join ''
    if ($head -ne $baseline) { throw 'Checkout is no longer the reviewed e917eaa baseline. Report its state before retrying.' }
    $branch = (Invoke-UpgradeNative 'git' @('-C', 'extension', 'branch', '--show-current')) -join ''
    if ($branch -eq 'main' -or $branch -like 'backup/*') { throw 'Do not run the upgrade from a protected branch.' }
    $changes = @(Invoke-UpgradeNative 'git' @('-C', 'extension', 'status', '--porcelain=v1', '--untracked-files=all'))
    foreach ($change in $changes) {
        if ($change -notmatch '^ M js/dist/(forum|admin)\.js(\.map)?$') { throw 'Unexpected local changes. Stop; nothing was stashed or switched.' }
    }
    Invoke-UpgradeNative 'git' @('-C', 'extension', 'fetch', 'origin', 'feature/local-token-images')
    $resolved = (Invoke-UpgradeNative 'git' @('-C', 'extension', 'rev-parse', '--verify', ($target + '^{commit}'))) -join ''
    if ($resolved -ne $target) { throw 'The tested source commit is unavailable.' }
    if ($changes.Count -gt 0) {
        Invoke-UpgradeNative 'git' @('-C', 'extension', 'stash', 'push', '-m', 'before-approved-embed-upload', '--', 'js/dist/forum.js', 'js/dist/forum.js.map', 'js/dist/admin.js', 'js/dist/admin.js.map')
        $stash = (Invoke-UpgradeNative 'git' @('-C', 'extension', 'rev-parse', 'refs/stash')) -join ''
        [IO.File]::WriteAllText((Join-Path $backup 'UPGRADE-STASH.txt'), $stash + "`n")
    }
    if (@(Invoke-UpgradeNative 'git' @('-C', 'extension', 'status', '--porcelain=v1', '--untracked-files=all')).Count -ne 0) { throw 'Checkout did not become clean. Stop here.' }
    $testBranch = 'test/embed-upload-494b41d-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
    Invoke-UpgradeNative 'git' @('-C', 'extension', 'switch', '-c', $testBranch, $target)
    $installed = (Invoke-UpgradeNative 'git' @('-C', 'extension', 'rev-parse', 'HEAD')) -join ''
    if ($installed -ne $target) { throw 'Unexpected source after checkout.' }

    Invoke-UpgradeNative 'docker' ($dc + @('run', '--rm', '-T', 'node', 'npm', 'ci'))
    Invoke-UpgradeNative 'docker' ($dc + @('run', '--rm', '-T', 'node', 'npm', 'run', 'check'))
    Invoke-UpgradeNative 'docker' ($dc + @('exec', '-T', '-w', '/var/www/flarum/packages/map-correct', 'app', 'composer', 'validate', '--strict', '--no-check-publish'))
    Invoke-UpgradeNative 'docker' ($dc + @('exec', '-T', '-w', '/var/www/flarum', 'app', 'composer', 'dump-autoload', '--no-scripts'))
    Invoke-UpgradeNative 'docker' ($dc + @('exec', '-T', '-w', '/var/www/flarum', 'app', 'php', 'packages/map-correct/scripts/Migrate-EmbedPresentation.php', '--approved-after-backup'))
    Invoke-UpgradeNative 'docker' ($dc + @('exec', '-T', '-w', '/var/www/flarum', 'app', 'php', 'flarum', 'cache:clear'))
    Invoke-UpgradeNative 'docker' ($dc + @('restart', 'app'))
    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        try {
            if ((Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/' -TimeoutSec 5).StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'App did not return HTTP 200 after restart. Report this error; do not restore SQL automatically.' }
    [IO.File]::WriteAllText((Join-Path $backup 'UPGRADE-COMPLETE.txt'), "Source: $target`nBranch: $testBranch`nHTTP 200; owner browser acceptance pending.`n")
    Write-Host "Upgrade complete. Source: $target"
    Write-Host "Test branch: $testBranch"
    Write-Host "Backup: $backup"
    Write-Host 'Hard-refresh all browser profiles and run the owner QA checklist.'
}
finally { Pop-Location }
