export type IdentityInfo = {
  userName: string;
  userId: string;
  identityProvider: string;
};

export type ClientPrincipal = {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: Array<{ typ: string; val: string }>;
};

/**
 * Best-effort identity parsing for Microsoft Entra / Azure Easy Auth.
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
 * Parses the Azure Easy Auth client principal from the x-ms-client-principal
 * header (base64-encoded JSON injected by the Azure auth gateway).
 *
 * In development (NODE_ENV !== 'production'), set the DEV_ROLES env var to a
 * comma-separated list of roles to simulate an authenticated user, e.g.:
 *   DEV_ROLES=admin
 */
export function parseClientPrincipalFromHeaders(
  headers: Headers,
): ClientPrincipal | null {
  // Dev mode: inject roles from DEV_ROLES env var so local dev works without
  // the Azure auth gateway.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_ROLES) {
    const devRoles = process.env.DEV_ROLES.split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    if (devRoles.length > 0) {
      return {
        identityProvider: 'dev',
        userId: 'dev-user',
        userDetails: 'dev@localhost',
        userRoles: devRoles,
      };
    }
  }

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

  // Treat anonymous-only sessions as unauthenticated.
  const roles = userRoles.map((r) => r.toLowerCase());
  const isAnonymous = roles.includes('anonymous');
  if (isAnonymous && roles.length === 1) return null;

  return { identityProvider, userId, userDetails, userRoles, claims };
}

/**
 * Returns the effective role set for a principal, merging userRoles and
 * claim-based roles (Entra app roles arrive via claims in Easy Auth).
 */
function resolveRoles(principal: ClientPrincipal): Set<string> {
  const roles = new Set(principal.userRoles.map((r) => r.toLowerCase()));
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
  return roles;
}

/**
 * Returns true if the request carries the given role, false otherwise.
 * Never throws — safe for endpoints that degrade gracefully for non-admins.
 */
export function hasRole(headers: Headers, role: string): boolean {
  const principal = parseClientPrincipalFromHeaders(headers);
  if (!principal) return false;
  return resolveRoles(principal).has(role.toLowerCase());
}

/**
 * Throws when the request is not authenticated or lacks the required role.
 * Intended for server API routes that must be role-gated.
 */
export function requireRole(
  headers: Headers,
  requiredRole: string,
): { principal: ClientPrincipal } {
  const principal = parseClientPrincipalFromHeaders(headers);
  if (!principal) {
    const err = new Error('Unauthorized');
    (err as any).statusCode = 401;
    throw err;
  }

  if (!resolveRoles(principal).has(requiredRole.toLowerCase())) {
    const err = new Error('Forbidden');
    (err as any).statusCode = 403;
    throw err;
  }

  return { principal };
}

function decodeBase64Utf8(value: string): string | null {
  try {
    // Node.js
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8');
    }
    // Edge runtime
    if (typeof atob !== 'undefined') {
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
