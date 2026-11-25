import { test } from "node:test";
import assert from "node:assert/strict";
import { resultsMatch } from "./compare";

test("ignores order, column names, extra columns; tolerates rounding", () => {
  assert.ok(resultsMatch([{ n: "b", r: 2.001 }, { n: "a", r: 1 }], [{ x: "A", y: 1 }, { x: "b", y: 2 }]));
  assert.ok(resultsMatch([{ name: "Drill", revenue: 100, units: 5 }], [{ product_name: "drill" }]));
  assert.ok(resultsMatch([{ v: 1004 }], [{ v: 1000 }]));
});

test("rejects wrong values, wrong row counts, fraction-vs-percent", () => {
  assert.ok(!resultsMatch([{ v: 1010 }], [{ v: 1000 }]));
  assert.ok(!resultsMatch([{ v: 1 }, { v: 2 }], [{ v: 1 }]));
  assert.ok(!resultsMatch([{ pct: 0.42 }], [{ pct: 42 }]));
  assert.ok(!resultsMatch([{ a: 1, b: 1 }], [{ a: 1, b: 2 }]));
});
