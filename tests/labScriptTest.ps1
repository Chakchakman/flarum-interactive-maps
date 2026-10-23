# Run with PowerShell 5.1 or newer. No Docker daemon or forum is used.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('map-lab-' + [guid]::NewGuid())
$originalLocation = (Get-Location).Path
New-Item -ItemType Directory -Path (Join-Path $fixture 'extension/scripts') -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot '../scripts/Test-Lab.ps1') (Join-Path $fixture 'extension/scripts/Test-Lab.ps1')
Set-Content (Join-Path $fixture 'docker-compose.yml') 'services: {}'
$global:labTestCalls = @()
$global:labTestFailAt = ''
function docker {
    $line = $args -join ' '
    $global:labTestCalls += $line
    $global:LASTEXITCODE = 0
    if ($global:labTestFailAt -and $line.EndsWith($global:labTestFailAt)) { $global:LASTEXITCODE = 17 }
}
function git { $global:LASTEXITCODE = 0 }
try {
    & (Join-Path $fixture 'extension/scripts/Test-Lab.ps1') -LabPath $fixture
    if ($global:labTestCalls.Count -ne 8) { throw "Unexpected Docker call count: $($global:labTestCalls.Count)" }
    if (-not $global:labTestCalls[-1].EndsWith('php flarum cache:clear')) { throw 'Cache clear must be last.' }
    if ((Get-Location).Path -ne $originalLocation) { throw 'Working directory was not restored.' }

    foreach ($failure in @('config --quiet', 'composer validate --strict --no-check-publish', 'php tests/mapPermissionsTest.php', 'npm ci', 'npm run check')) {
        $global:labTestCalls = @()
        $global:labTestFailAt = $failure
        $caught = $false
        try { & (Join-Path $fixture 'extension/scripts/Test-Lab.ps1') -LabPath $fixture }
        catch {
            $caught = $true
            if ($_.Exception.Message -notlike '*exit 17*') { throw }
        }
        if (-not $caught) { throw "Failure was ignored: $failure" }
        if (-not $global:labTestCalls[-1].EndsWith($failure)) { throw "Continued after failure: $failure" }
        if ((Get-Location).Path -ne $originalLocation) { throw 'Working directory was not restored after failure.' }
    }
    $global:LASTEXITCODE = 0
    Write-Host 'Lab script success and failure-path checks passed.'
}
finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Remove-Item Function:docker, Function:git
    Remove-Variable labTestCalls, labTestFailAt -Scope Global
}
