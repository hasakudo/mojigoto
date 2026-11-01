import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Web配布の実際のフィルターは設定・秘密値・利用者データを除外し、設定例と保護ファイルを含める", { skip: process.platform !== "win32" }, () => {
  const path = fileURLToPath(new URL("../scripts/package-web.ps1", import.meta.url)).replace(/'/g, "''");
  const script = `
    $tokens = $null; $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile('${path}', [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw $parseErrors[0].Message }
    $function = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-WebReleasePath' }, $true)[0]
    Invoke-Expression $function.Extent.Text
    foreach ($item in @('config.json','api/auth/config.php','api/auth/config.bak.php','config.local.php','api/auth/data/users.json','api/auth/data/cache.php','.env.php','.local-config/secret.php','node_modules/a.js','.git/config.html','announcements.json','a.log')) {
      if (Test-WebReleasePath $item) { throw ('private file included: ' + $item) }
    }
    foreach ($item in @('index.html','app.mjs','api/auth/bootstrap.php','api/auth/config.example.php','config.production.example.json','config.example.json','api/auth/data/.htaccess','.htaccess','README.md','images/icon.png')) {
      if (-not (Test-WebReleasePath $item)) { throw ('public file missing: ' + $item) }
    }
    Write-Output 'policy-ok'
  `;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /policy-ok/);
});
