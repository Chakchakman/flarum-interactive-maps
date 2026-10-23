#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$LabPath = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Executable failed (exit $LASTEXITCODE): $($Arguments -join ' ')"
    }
}

$lab = (Resolve-Path -LiteralPath $LabPath).Path
$extension = Join-Path $lab 'extension'
$scriptRepository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ((Resolve-Path -LiteralPath $extension).Path -ne $scriptRepository) {
    throw 'Run the script from the extension checkout mounted by this lab.'
}
$compose = Join-Path $lab 'docker-compose.yml'
if (-not (Test-Path -LiteralPath $compose -PathType Leaf)) {
    throw "Missing Compose file: $compose"
}
Get-Command docker -ErrorAction Stop | Out-Null
Get-Command git -ErrorAction Stop | Out-Null

Push-Location $lab
try {
    # Explicit project directory keeps relative bind mounts pointed at this lab.
    $dc = @('compose', '--project-directory', $lab, '-f', $compose)
    Invoke-Checked 'docker' ($dc + @('config', '--quiet'))
    Invoke-Checked 'git' @('-C', $extension, 'status', '--short', '--branch')
    Invoke-Checked 'git' @('-C', $extension, 'rev-parse', 'HEAD')

    $php = $dc + @('exec', '-T', '-w', '/var/www/flarum/packages/map-correct', 'app')
    Invoke-Checked 'docker' ($php + @('composer', 'validate', '--strict', '--no-check-publish'))
    foreach ($test in @('mapPermissionsTest.php', 'postMapAccessTest.php', 'postTokenMoveAccessTest.php')) {
        Invoke-Checked 'docker' ($php + @('php', "tests/$test"))
    }

    Invoke-Checked 'docker' ($dc + @('run', '--rm', '-T', 'node', 'npm', 'ci'))
    Invoke-Checked 'docker' ($dc + @('run', '--rm', '-T', 'node', 'npm', 'run', 'check'))
    Invoke-Checked 'docker' ($dc + @('exec', '-T', '-w', '/var/www/flarum', 'app', 'php', 'flarum', 'cache:clear'))
    Write-Host 'Checks, production build and Flarum cache clear succeeded.'
    Write-Host 'Hard-refresh the forum. Check posts, BBCode and a test reply before testing maps.'
    Write-Host 'The SHA above identifies HEAD; any listed local edits are also included in this build.'
}
finally {
    Pop-Location
}
