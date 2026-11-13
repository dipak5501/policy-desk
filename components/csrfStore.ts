/**
 * In-memory CSRF token for authenticated mutating requests.
 * Auth cookies stay HttpOnly; the token arrives via auth/session JSON, never document.cookie.
 */

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null | undefined): void {
  csrfToken = token && token.length > 0 ? token : null;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function csrfHeaders(): HeadersInit {
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}
