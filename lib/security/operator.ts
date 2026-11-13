/** Shared-secret operator gate for approve/reject (demo auth, not production). */

export function operatorToken(): string {
  return process.env.OPERATOR_TOKEN ?? "";
}

export function assertOperator(request: Request): boolean {
  const expected = operatorToken();
  if (!expected) return false;
  const header = request.headers.get("x-operator-token") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  return header === expected || bearer === expected;
}
