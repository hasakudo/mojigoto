<?php
declare(strict_types=1);

function auth_jwt_bytes(string $value): string
{
    if ($value === '' || !preg_match('/^[A-Za-z0-9_-]+$/D', $value)) throw new RuntimeException('JWT encoding is invalid.');
    $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
    if ($decoded === false) throw new RuntimeException('JWT encoding is invalid.');
    return $decoded;
}

function auth_der(string $tag, string $value): string
{
    $length = strlen($value);
    $encoded = '';
    if ($length < 128) $encoded = chr($length);
    else {
        while ($length > 0) { $encoded = chr($length & 255) . $encoded; $length >>= 8; }
        $encoded = chr(128 | strlen($encoded)) . $encoded;
    }
    return $tag . $encoded . $value;
}

function auth_rsa_public_key(array $jwk): string
{
    $integers = '';
    foreach (['n', 'e'] as $field) {
        $bytes = ltrim(auth_jwt_bytes((string) ($jwk[$field] ?? '')), "\x00");
        if ($bytes === '') throw new RuntimeException('RSA key is invalid.');
        if (ord($bytes[0]) & 128) $bytes = "\x00" . $bytes;
        $integers .= auth_der("\x02", $bytes);
    }
    $rsa = auth_der("\x30", $integers);
    $algorithm = hex2bin('300d06092a864886f70d0101010500');
    $spki = auth_der("\x30", $algorithm . auth_der("\x03", "\x00" . $rsa));
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function auth_verify_id_token(string $jwt, array $config, string $nonce, ?array $jwks = null): array
{
    if (!function_exists('openssl_verify')) throw new RuntimeException('OpenSSL is required for ID token verification.');
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) throw new RuntimeException('ID token format is invalid.');
    $header = json_decode(auth_jwt_bytes($parts[0]), true);
    $claims = json_decode(auth_jwt_bytes($parts[1]), true);
    if (!is_array($header) || !is_array($claims) || ($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
        throw new RuntimeException('ID token signing algorithm is invalid.');
    }
    $issuer = 'https://cognito-idp.' . $config['region'] . '.amazonaws.com/' . $config['user_pool_id'];
    if ($jwks === null) {
        // Only the configured Cognito pool is trusted; never use a token-supplied URL.
        $response = auth_http($issuer . '/.well-known/jwks.json');
        $jwks = json_decode($response['body'], true);
        if ($response['status'] !== 200 || !is_array($jwks)) throw new RuntimeException('Cognito signing keys are unavailable.');
    }
    $verified = false;
    foreach (($jwks['keys'] ?? []) as $key) {
        if (($key['kid'] ?? '') !== $header['kid'] || ($key['kty'] ?? '') !== 'RSA'
            || ($key['alg'] ?? '') !== 'RS256' || ($key['use'] ?? '') !== 'sig') continue;
        $verified = openssl_verify($parts[0] . '.' . $parts[1], auth_jwt_bytes($parts[2]), auth_rsa_public_key($key), OPENSSL_ALGO_SHA256) === 1;
        break;
    }
    if (!$verified) throw new RuntimeException('ID token signature is invalid.');
    if (($claims['iss'] ?? '') !== $issuer || ($claims['aud'] ?? '') !== $config['client_id']
        || ($claims['token_use'] ?? '') !== 'id' || !is_string($claims['sub'] ?? null) || $claims['sub'] === ''
        || (int) ($claims['exp'] ?? 0) <= time() || (int) ($claims['iat'] ?? 0) > time() + 60
        || (int) ($claims['nbf'] ?? 0) > time() + 60 || $nonce === '' || !hash_equals($nonce, (string) ($claims['nonce'] ?? ''))) {
        throw new RuntimeException('ID token claims are invalid.');
    }
    return $claims;
}
