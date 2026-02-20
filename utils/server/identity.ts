export type IdentityInfo = {
  userName: string;
  userId: string;
  identityProvider: string;
};

export type SwaClientPrincipal = {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: Array<{ typ: string; val: string }>;
};

/**
 * Best-effort identity parsing for Microsoft Entra / Azure Static Web Apps.
 * Returns null when no identity headers are present.
 */
export function parseIdentityInfoFromHeaders(
  headers: Headers,
): IdentityInfo | null {
  const info: IdentityInfo = {
    userName: headers.get('x-ms-client-principal-name') ?? '',
    userId: headers.get('x-ms-client-principal-id') ?? '',
    identityProvider: headers.get('x-ms-client-principal-idp') ?? '',
  };

  const hasAny = Object.values(info).some((v) => v.trim() !== '');
  return hasAny ? info : null;
}

/**
 * Parses the full Azure Static Web Apps client principal payload.
 *
 * SWA populates `x-ms-client-principal` with a base64-encoded JSON document.
 * This is the most reliable place to get roles (e.g. `admin`).
 */
export function parseSwaClientPrincipalFromHeaders(
  headers: Headers,
): SwaClientPrincipal | null {
  const raw = headers.get('x-ms-client-principal');
  if (!raw) return null;

  const jsonText = decodeBase64Utf8(raw);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const identityProvider =
    typeof obj.identityProvider === 'string' ? obj.identityProvider : '';
  const userId = typeof obj.userId === 'string' ? obj.userId : '';
  const userDetails =
    typeof obj.userDetails === 'string' ? obj.userDetails : '';
  const userRoles = Array.isArray(obj.userRoles)
    ? obj.userRoles.filter((r) => typeof r === 'string')
    : [];

  const claims = Array.isArray(obj.claims)
    ? obj.claims
        .filter((c) => c && typeof c === 'object')
        .map((c) => c as Record<string, unknown>)
        .map((c) => ({ typ: String(c.typ ?? ''), val: String(c.val ?? '') }))
    : undefined;

  // If SWA thinks you're anonymous, treat as unauthenticated.
  const roles = userRoles.map((r) => r.toLowerCase());
  const isAnonymous = roles.includes('anonymous');
  if (isAnonymous && roles.length === 1) return null;

  return {
    identityProvider,
    userId,
    userDetails,
    userRoles,
    claims,
  };
}

/**
 * Throws when the request is not authenticated or missing the required SWA role.
 * Intended for server API routes that must be admin-only.
 */
export function requireSwaRole(
  headers: Headers,
  requiredRole: string,
): {
  principal: SwaClientPrincipal;
} {
  const principal = parseSwaClientPrincipalFromHeaders(headers);
  if (!principal) {
    const err = new Error('Unauthorized');
    (err as any).statusCode = 401;
    throw err;
  }

  const roles = new Set(principal.userRoles.map((r) => r.toLowerCase()));
  // Some auth providers (e.g. Entra via Easy Auth) may not populate `userRoles`
  // with app roles, but will include them in claims.
  for (const claim of principal.claims ?? []) {
    const typ = claim.typ.toLowerCase();
    if (
      typ === 'roles' ||
      typ === 'role' ||
      typ.endsWith('/role') ||
      typ.includes('claims/role')
    ) {
      roles.add(claim.val.toLowerCase());
    }
  }

  if (!roles.has(requiredRole.toLowerCase())) {
    const err = new Error('Forbidden');
    (err as any).statusCode = 403;
    throw err;
  }

  return { principal };
}

function decodeBase64Utf8(value: string): string | null {
  try {
    // Node.js (Next.js API routes)
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8');
    }
    // Edge runtime (Web)
    if (typeof atob !== 'undefined') {
      // atob returns a binary string; decode to UTF-8
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return null;
  } catch {
    return null;
  }
}
