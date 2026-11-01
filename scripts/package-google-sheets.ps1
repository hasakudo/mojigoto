[CmdletBinding()]
param(
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$sourceRoot = Join-Path $repoRoot "integrations\google-sheets"
$releaseRoot = Join-Path $repoRoot "release"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $releaseRoot "mojigoto-google-sheets-v2.zip"
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)

New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($resolvedOutput)) -Force | Out-Null

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingRoot = Join-Path $tempRoot ("mojigoto-sheets-v2-" + [guid]::NewGuid().ToString("N"))
$resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
if (-not $resolvedStaging.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not ([System.IO.Path]::GetFileName($resolvedStaging)).StartsWith("mojigoto-sheets-v2-", [System.StringComparison]::Ordinal)) {
    throw "安全な一時フォルダを作成できませんでした。"
}

try {
    New-Item -ItemType Directory -Path $resolvedStaging | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot "m_progress_v2.gs") -Destination (Join-Path $resolvedStaging "m_progress.gs")
    Copy-Item -LiteralPath (Join-Path $sourceRoot "README.md") -Destination (Join-Path $resolvedStaging "README.md")
    Copy-Item -LiteralPath (Join-Path $sourceRoot "LICENSE") -Destination (Join-Path $resolvedStaging "LICENSE")

    Compress-Archive -LiteralPath @(
        (Join-Path $resolvedStaging "m_progress.gs"),
        (Join-Path $resolvedStaging "README.md"),
        (Join-Path $resolvedStaging "LICENSE")
    ) -DestinationPath $resolvedOutput -CompressionLevel Optimal -Force

    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutput
    Write-Output "Package: $resolvedOutput"
    Write-Output "SHA256: $($hash.Hash)"
}
finally {
    if (Test-Path -LiteralPath $resolvedStaging) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
}
