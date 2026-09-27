import { describe, expect, test } from "bun:test";
import {
  ROLES,
  ROLE_ORDER,
  assignRoles,
  calculateRoundScores,
  generatePlayerOrder,
  rankPlayers,
  sanitiseRoleConfig,
  shuffle,
  type RoleConfig,
  type RoleKey,
} from "./game";

/** Deterministic rng (LCG) so assignment is reproducible in tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("shuffle", () => {
  test("keeps every element and does not mutate the input", () => {
    const input = ["a", "b", "c", "d", "e"];
    const output = shuffle(input, seeded(1));
    expect([...output].sort()).toEqual([...input].sort());
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("is deterministic for a given rng", () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(42))).toEqual(
      shuffle([1, 2, 3, 4, 5], seeded(42)),
    );
  });
});

describe("generatePlayerOrder", () => {
  test("visits every player once, starting at the given index", () => {
    expect(generatePlayerOrder(["A", "B", "C"], 0)).toEqual(["A", "B", "C"]);
    expect(generatePlayerOrder(["A", "B", "C"], 2)).toEqual(["C", "A", "B"]);
  });

  test("handles an empty list and wraps out-of-range starts", () => {
    expect(generatePlayerOrder([], 3)).toEqual([]);
    expect(generatePlayerOrder(["A", "B", "C"], 5)).toEqual(["C", "A", "B"]);
  });
});

describe("sanitiseRoleConfig", () => {
  test("clamps negatives / non-numbers to zero and keeps max >= min", () => {
    const config = sanitiseRoleConfig({
      baddieMin: -2,
      baddieMax: Number.NaN,
      bastardMin: 1,
      bastardMax: 0,
    });
    expect(config.baddieMin).toBe(0);
    expect(config.baddieMax).toBe(0);
    expect(config.bastardMin).toBe(1);
    expect(config.bastardMax).toBe(1);
  });
});

describe("assignRoles", () => {
  const aggressive: RoleConfig = {
    baddieMin: 0,
    baddieMax: 5,
    bastardMin: 0,
    bastardMax: 5,
  };

  test("keeps Boring players the strict majority over many runs", () => {
    const players = ["A", "B", "C", "D", "E"];
    for (let seed = 1; seed <= 2000; seed++) {
      const { roles, summary } = assignRoles(players, aggressive, seeded(seed));
      expect(summary.boringCount).toBeGreaterThan(
        summary.baddieCount + summary.bastardCount,
      );
      expect(Object.keys(roles).sort()).toEqual([...players].sort());
      for (const role of Object.values(roles)) {
        expect(ROLE_ORDER).toContain(role as RoleKey);
      }
    }
  });

  test("never exceeds the special-role cap", () => {
    const players = ["A", "B", "C", "D"];
    const cap = Math.floor((players.length - 1) / 2);
    for (let seed = 1; seed <= 500; seed++) {
      const { summary } = assignRoles(players, aggressive, seeded(seed));
      expect(summary.baddieCount + summary.bastardCount).toBeLessThanOrEqual(cap);
    }
  });

  test("honours minimums when they fit", () => {
    const players = ["A", "B", "C", "D", "E"]; // cap = 2
    const { summary } = assignRoles(
      players,
      { baddieMin: 1, baddieMax: 1, bastardMin: 1, bastardMax: 1 },
      seeded(7),
    );
    expect(summary.baddieCount).toBe(1);
    expect(summary.bastardCount).toBe(1);
    expect(summary.wasAdjusted).toBe(false);
  });
});

describe("calculateRoundScores", () => {
  test("scores a Boring player by every vote decision", () => {
    const { totals, details } = calculateRoundScores(
      ["A", "B", "C"],
      { A: "BORING", B: "BADDIE", C: "BASTARD" },
      { A: ["B"], B: ["A"], C: ["A"] },
    );
    // A voted for the Baddie (+5) and left the Bastard unvoted (+1).
    expect(totals.A).toBe(6);
    expect(totals.B).toBe(-2); // one vote received
    expect(totals.C).toBe(0); // no votes received
    expect(details.A.breakdown).toHaveLength(2);
  });

  test("rewards an unaccused Baddie and an accused Bastard", () => {
    const loner = calculateRoundScores(
      ["A", "B"],
      { A: "BORING", B: "BADDIE" },
      { A: [] },
    );
    expect(loner.totals.B).toBe(3);

    const accused = calculateRoundScores(
      ["A", "B"],
      { A: "BORING", B: "BASTARD" },
      { A: ["B"] },
    );
    expect(accused.totals.B).toBe(1);
  });
});

describe("rankPlayers", () => {
  test("sorts by total, highest first", () => {
    expect(rankPlayers(["A", "B", "C"], { A: 1, B: 9, C: 5 })).toEqual([
      "B",
      "C",
      "A",
    ]);
  });
});

describe("ROLES", () => {
  test("only Boring and Bastard can see the word", () => {
    expect(ROLES.BORING.seesWord).toBe(true);
    expect(ROLES.BASTARD.seesWord).toBe(true);
    expect(ROLES.BADDIE.seesWord).toBe(false);
  });
});
