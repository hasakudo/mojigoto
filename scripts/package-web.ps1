[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$webRoot = Join-Path $repoRoot 'web'
$releaseName = 'mojigoto-web-update-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$releaseRoot = Join-Path (Join-Path $repoRoot 'release') $releaseName
$payloadRoot = Join-Path $releaseRoot 'upload'
$zipPath = Join-Path $releaseRoot ($releaseName + '.zip')
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

# Copy program files only. Never replace production configuration or mutable data.
function Test-WebReleasePath([string] $Relative) {
    $normalized = $Relative.Replace('\', '/').ToLowerInvariant()
    if ($normalized -match '(^|/)(\.git|\.local-config|node_modules)(/|$)' -or
        $normalized -match '(^|/)\.env($|\.)') { return $false }
    if ($normalized -eq 'config.json' -or $normalized -eq 'api/auth/config.php') { return $false }
    if ($normalized.StartsWith('api/auth/data/') -and $normalized -ne 'api/auth/data/.htaccess') { return $false }
    if ($normalized -match '(^|/)config[^/]*\.php$' -and $normalized -ne 'api/auth/config.example.php') { return $false }
    if ($normalized -in @('config.example.json', 'config.production.example.json')) { return $true }
    return $normalized.EndsWith('/.htaccess') -or $normalized -eq '.htaccess' -or $normalized -eq 'readme.md' -or
        [IO.Path]::GetExtension($normalized) -in @('.html', '.css', '.js', '.mjs', '.php', '.svg', '.png', '.ico', '.webmanifest')
}
$manifest = @()
foreach ($file in Get-ChildItem -LiteralPath $webRoot -File -Recurse -Force | Sort-Object FullName) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Symbolic links are not supported in release files.' }
    $relative = $file.FullName.Substring($webRoot.Length + 1).Replace('\', '/')
    if (-not (Test-WebReleasePath $relative)) { continue }
    $target = Join-Path $payloadRoot $relative
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target
    $manifest += [pscustomobject]@{ Path = $relative; Bytes = $file.Length; SHA256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash }
}
if ($manifest.Count -eq 0) { throw 'No files to package.' }
$manifest | Export-Csv -LiteralPath (Join-Path $releaseRoot 'upload-manifest.csv') -NoTypeInformation -Encoding utf8
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/web-upload-guide.md') -Destination (Join-Path $releaseRoot 'UPLOAD-GUIDE.md')
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/admin-auth-setup.md') -Destination (Join-Path $releaseRoot 'admin-auth-setup.md')

# ZipFile includes .htaccess files, unlike archive tools that skip hidden files.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($payloadRoot, $zipPath)
Write-Output "Upload folder: $payloadRoot"
Write-Output "ZIP: $zipPath"
Write-Output "Files: $($manifest.Count)"
Write-Output ('SHA256: ' + (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)
