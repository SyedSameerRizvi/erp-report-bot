// Execution-accuracy check: does the bot's result contain the gold result?
// Row order is ignored; extra columns in the bot's result are allowed; numbers match within ±0.5% (or 0.01).
type Row = Record<string, unknown>;

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 0.01);
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** every gold value appears in a distinct value of the predicted row */
function rowCovers(pred: unknown[], gold: unknown[]): boolean {
  const used = new Set<number>();
  return gold.every(g => {
    const i = pred.findIndex((p, j) => !used.has(j) && same(p, g));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

export function resultsMatch(pred: Row[], gold: Row[]): boolean {
  if (pred.length !== gold.length) return false;
  const P = pred.map(r => Object.values(r));
  const used = new Set<number>();
  return gold.every(gr => {
    const g = Object.values(gr);
    const i = P.findIndex((p, j) => !used.has(j) && rowCovers(p, g));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}
