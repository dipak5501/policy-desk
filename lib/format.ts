export function formatUsdc(baseUnits: string | bigint | number): string {
  const n = typeof baseUnits === "bigint" ? Number(baseUnits) : Number(baseUnits);
  return (n / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function shortKey(key: string, size = 4): string {
  if (key.length <= size * 2 + 1) return key;
  return `${key.slice(0, size)}…${key.slice(-size)}`;
}

export function formatSol(sol: number): string {
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  });
}
