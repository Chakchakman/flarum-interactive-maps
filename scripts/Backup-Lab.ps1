#Requires -Version 5.1
[CmdletBinding()]
param([string]$LabPath = (Get-Location).Path)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Invoke-BackupNative {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE). Backup is incomplete; stop here." }
}
function Write-BackupText {
    param([string]$Path, [string]$Value)
    [IO.File]::WriteAllText($Path, $Value.Replace("`r`n", "`n"), [Text.UTF8Encoding]::new($false))
}

$lab = (Resolve-Path -LiteralPath $LabPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $lab 'docker-compose.yml') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $lab 'extension') -PathType Container)) {
    throw 'Expected docker-compose.yml and extension in the lab folder.'
}
foreach ($command in @('docker', 'git', 'tar.exe')) { Get-Command $command -ErrorAction Stop | Out-Null }
$tag = 'maps-backup-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$backup = Join-Path $lab ('_backups/' + $tag)
Push-Location $lab
try {
    $dc = @('compose', '--project-directory', $lab, '-f', (Join-Path $lab 'docker-compose.yml'))
    Invoke-BackupNative 'docker' ($dc + @('config', '--quiet'))
    $services = @(Invoke-BackupNative 'docker' ($dc + @('ps', '--status', 'running', '--services')))
    if ($services -notcontains 'app' -or $services -notcontains 'db') { throw 'Both app and db must be running.' }
    $head = (Invoke-BackupNative 'git' @('-C', 'extension', 'rev-parse', 'HEAD')) -join ''
    if ($head -notmatch '^[a-f0-9]{40}$') { throw 'Could not identify the current Git commit.' }
    $status = (Invoke-BackupNative 'git' @('-C', 'extension', 'status', '--short', '--branch')) -join "`n"
    New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
    Write-BackupText (Join-Path $backup 'HEAD.txt') ($head + "`n")
    Write-BackupText (Join-Path $backup 'git-status.txt') ($status + "`n")

    # PHP obtains only the actual database name; credentials never leave containers.
    $probe = @'
<?php
try {
    $config = require '/var/www/flarum/config.php';
    $name = $config['database']['database'] ?? null;
    if (!is_string($name) || $name === '') throw new RuntimeException();
    echo base64_encode($name);
} catch (Throwable $error) {
    fwrite(STDERR, 'Database metadata probe failed.'.PHP_EOL);
    exit(1);
}
'@
    $probePath = Join-Path $backup 'database-name-probe.php'
    Write-BackupText $probePath $probe
    Invoke-BackupNative 'docker' ($dc + @('cp', $probePath, "app:/tmp/$tag.php"))
    $database64 = (Invoke-BackupNative 'docker' ($dc + @('exec', '-T', 'app', 'php', "/tmp/$tag.php"))) -join ''
    if ($database64 -notmatch '^[A-Za-z0-9+/]+={0,2}$') { throw 'Unexpected database metadata. Stop here.' }
    # Fail on malformed base64 too, before any dump command.
    if ([Convert]::FromBase64String($database64).Length -eq 0) { throw 'Empty database name.' }
    $dump = @'
set -eu
umask 077
maps_backup_tag=$1
case "$maps_backup_tag" in maps-backup-*[!a-zA-Z0-9-]*|'') exit 2;; maps-backup-*) ;; *) exit 2;; esac
maps_backup_database=$(printf '%s' "$2" | base64 -d)
[ -n "$maps_backup_database" ]
MYSQL_PWD=${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}
if [ -z "$MYSQL_PWD" ]; then
    echo 'Root password environment is unavailable; no dump was made.' >&2
    exit 1
fi
export MYSQL_PWD
mariadb-dump --user=root --single-transaction --quick --routines --triggers --events --result-file="/tmp/$maps_backup_tag.sql" -- "$maps_backup_database"
test -s "/tmp/$maps_backup_tag.sql"
tail -n 5 "/tmp/$maps_backup_tag.sql" | grep -q '^-- Dump completed'
echo 'Database dump completed and footer checked.'
'@
    $dumpPath = Join-Path $backup 'dump-database.sh'
    Write-BackupText $dumpPath $dump
    Invoke-BackupNative 'docker' ($dc + @('cp', $dumpPath, "db:/tmp/$tag.sh"))
    Invoke-BackupNative 'docker' ($dc + @('exec', '-T', 'db', 'sh', "/tmp/$tag.sh", $tag, $database64))
    Invoke-BackupNative 'docker' ($dc + @('cp', "db:/tmp/$tag.sql", (Join-Path $backup 'database.sql')))

    # Binary archives are created as files, never redirected through PowerShell stdout.
    Invoke-BackupNative 'tar.exe' @('--exclude=node_modules', '-czf', (Join-Path $backup 'extension.tgz'), '-C', $lab, 'extension')
    Invoke-BackupNative 'docker' ($dc + @('exec', '-T', '-w', '/var/www/flarum', 'app', 'tar', '-czf', "/tmp/$tag-storage.tgz", 'storage', 'composer.json', 'composer.lock'))
    Invoke-BackupNative 'docker' ($dc + @('exec', '-T', 'app', 'tar', '-tzf', "/tmp/$tag-storage.tgz")) | Out-Null
    Invoke-BackupNative 'docker' ($dc + @('cp', "app:/tmp/$tag-storage.tgz", (Join-Path $backup 'storage.tgz')))
    foreach ($archive in @('extension.tgz', 'storage.tgz')) {
        Invoke-BackupNative 'tar.exe' @('-tzf', (Join-Path $backup $archive)) | Out-Null
    }
    $files = foreach ($name in @('extension.tgz', 'database.sql', 'storage.tgz')) {
        $file = Get-Item -LiteralPath (Join-Path $backup $name)
        if ($file.Length -le 0) { throw "Empty backup file: $name" }
        [pscustomobject]@{ Name = $name; Length = $file.Length; SHA256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
    }
    Write-BackupText (Join-Path $backup 'checksums.json') (ConvertTo-Json -InputObject @($files))
    Write-BackupText (Join-Path $backup 'BACKUP-COMPLETE.txt') "Archives readable; dump completed; hashes recorded. No restore test performed.`n"
    Write-Host "Backup complete: $backup"
    $files | Format-Table Name, Length -AutoSize
    Write-Host 'Keep this folder private. Send only the path and file sizes, never SQL or archives.'
    Write-Host 'Checkout, database schema and services have not been changed.'
}
finally { Pop-Location }
