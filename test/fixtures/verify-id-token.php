<?php
declare(strict_types=1);
require __DIR__ . '/../../web/api/auth/bootstrap.php';
$input = json_decode(stream_get_contents(STDIN), true);
foreach ($input['cases'] as $case) {
    $accepted = false;
    try { auth_verify_id_token($case['token'], $input['config'], $case['nonce'], $input['jwks']); $accepted = true; }
    catch (Throwable $error) {}
    if ($accepted !== $case['accepted']) throw new RuntimeException('Unexpected result: ' . $case['name']);
}
echo "signature checks passed\n";
