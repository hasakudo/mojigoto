[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$snapshotRoot = Join-Path $repoRoot ('.review-baseline/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
$sourceRoot = Join-Path $snapshotRoot 'source'
New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null

Push-Location $repoRoot
try {
    # Include uncommitted and untracked sources without changing the Git index.
    $paths = @(git -c core.quotePath=false ls-files --cached --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) { throw 'Could not list source files.' }
    $manifest = @()
    $excluded = @()
    foreach ($relative in ($paths | Sort-Object -Unique)) {
        $relative = $relative.Replace('\', '/')
        if ($relative -match '^(\.git/|\.agents/|\.codex/|\.aws/|\.vscode/|node_modules/|release/|\.review-baseline/|\.local-config/)' -or
            $relative -match '(^|/)(\.env($|\.)|config\.php$)' -or
            $relative -eq 'web/config.json' -or
            ($relative.StartsWith('web/api/auth/data/') -and $relative -ne 'web/api/auth/data/.htaccess') -or
            $relative -match '\.(vsix|zip|log|pem|key|pfx)$' -or
            $relative -eq 'vertical-preview.html') {
            $excluded += $relative
            continue
        }
        $source = [IO.Path]::GetFullPath((Join-Path $repoRoot $relative))
        if (-not $source.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Source path is outside the repository.'
        }
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $excluded += $relative; continue }
        if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked source files are not supported.' }
        $target = Join-Path $sourceRoot $relative
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $target
        $manifest += [pscustomobject]@{ Path = $relative; SHA256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash }
    }
    $manifest | Export-Csv -LiteralPath (Join-Path $snapshotRoot 'source-manifest.csv') -NoTypeInformation -Encoding utf8
    $excluded | Set-Content -LiteralPath (Join-Path $snapshotRoot 'excluded-paths.txt') -Encoding utf8
    git status --short | Set-Content -LiteralPath (Join-Path $snapshotRoot 'git-status.txt') -Encoding utf8
    [pscustomobject]@{
        Head = (git rev-parse HEAD)
        Node = (node --version)
        Npm = (npm --version)
        ExtensionVersion = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
        Files = $manifest.Count
        Note = 'Local source snapshot. Runtime configuration and user data are excluded; restore configuration separately. Not a production backup or a public distribution.'
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $snapshotRoot 'environment.json') -Encoding utf8
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipPath = Join-Path $snapshotRoot 'source.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $zipPath)
    Write-Output "Snapshot: $snapshotRoot"
    Write-Output "Files: $($manifest.Count)"
    Write-Output ('ZIP SHA256: ' + (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)
}
finally {
    Pop-Location
}
