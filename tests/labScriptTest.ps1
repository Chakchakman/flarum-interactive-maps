# Run with PowerShell 5.1 or newer. No Docker daemon or forum is used.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('map-lab-' + [guid]::NewGuid())
$originalLocation = (Get-Location).Path
New-Item -ItemType Directory -Path (Join-Path $fixture 'extension/scripts') -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot '../scripts/Test-Lab.ps1') (Join-Path $fixture 'extension/scripts/Test-Lab.ps1')
Set-Content (Join-Path $fixture 'docker-compose.yml') 'services: {}'
$script:calls = @()
$script:failAt = ''
function docker {
    $line = $args -join ' '
    $script:calls += $line
    $global:LASTEXITCODE = 0
    if ($script:failAt -and $line.EndsWith($script:failAt)) { $global:LASTEXITCODE = 17 }
}
function git { $global:LASTEXITCODE = 0 }
try {
    & (Join-Path $fixture 'extension/scripts/Test-Lab.ps1') -LabPath $fixture
    if ($script:calls.Count -ne 8) { throw "Unexpected Docker call count: $($script:calls.Count)" }
    if (-not $script:calls[-1].EndsWith('php flarum cache:clear')) { throw 'Cache clear must be last.' }
    if ((Get-Location).Path -ne $originalLocation) { throw 'Working directory was not restored.' }

    foreach ($failure in @('config --quiet', 'composer validate --strict --no-check-publish', 'php tests/mapPermissionsTest.php', 'npm ci', 'npm run check')) {
        $script:calls = @()
        $script:failAt = $failure
        $caught = $false
        try { & (Join-Path $fixture 'extension/scripts/Test-Lab.ps1') -LabPath $fixture }
        catch {
            $caught = $true
            if ($_.Exception.Message -notlike '*exit 17*') { throw }
        }
        if (-not $caught) { throw "Failure was ignored: $failure" }
        if (-not $script:calls[-1].EndsWith($failure)) { throw "Continued after failure: $failure" }
        if ((Get-Location).Path -ne $originalLocation) { throw 'Working directory was not restored after failure.' }
    }
    Write-Host 'Lab script success and failure-path checks passed.'
}
finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Remove-Item Function:docker, Function:git
}
