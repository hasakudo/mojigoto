<?php
declare(strict_types=1);

// Store only profile identifiers, never tokens, passwords or provider usernames.
function auth_normalize_cognito_identities($value): array
{
    if (!is_array($value)) return [];
    $identities = [];
    foreach ($value as $item) {
        if (!is_array($item)) continue;
        $issuer = trim((string) ($item['issuer'] ?? ''));
        $sub = strtolower(trim((string) ($item['sub'] ?? '')));
        if (!preg_match('~^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[A-Za-z0-9_-]+$~D', $issuer)
            || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $sub)) continue;
        $provider = (string) ($item['provider'] ?? '');
        $lastLoginAt = trim((string) ($item['lastLoginAt'] ?? ''));
        $identities[$issuer . '|' . $sub] = [
            'issuer' => $issuer,
            'sub' => $sub,
            'provider' => in_array($provider, ['google', 'microsoft', 'email'], true) ? $provider : '',
            'lastLoginAt' => $lastLoginAt !== '' && strtotime($lastLoginAt) !== false ? $lastLoginAt : '',
        ];
    }
    return array_values($identities);
}

function auth_remember_cognito_identity(array $config, $existing, array $verifiedIdentity, string $provider, string $now): array
{
    $identities = auth_normalize_cognito_identities($existing);
    $expectedIssuer = 'https://cognito-idp.' . ($config['region'] ?? '') . '.amazonaws.com/' . ($config['user_pool_id'] ?? '');
    if (($verifiedIdentity['issuer'] ?? '') !== $expectedIssuer) return $identities;
    $candidate = auth_normalize_cognito_identities([[
        'issuer' => $verifiedIdentity['issuer'],
        'sub' => $verifiedIdentity['sub'] ?? '',
        'provider' => $provider,
        'lastLoginAt' => $now,
    ]]);
    return auth_normalize_cognito_identities(array_merge($identities, $candidate));
}
