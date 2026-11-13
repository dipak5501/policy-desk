import {
  assertCsrf,
  operatorConfigured,
  readOperatorSession,
} from "@/lib/security/session";

/**
 * Operator authorization for approve/reject.
 * Requires server-side OPERATOR_TOKEN configured (fail closed) and
 * an HttpOnly operator session cookie issued by /api/operator/login.
 * Legacy x-operator-token header is rejected on purpose (no public secrets).
 */
export function assertOperator(request: Request): boolean {
  if (!operatorConfigured()) return false;
  if (!readOperatorSession(request)) return false;
  // CSRF for cookie-authenticated mutating requests
  if (!assertCsrf(request)) return false;
  return true;
}
