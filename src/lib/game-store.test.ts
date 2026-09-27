import { afterEach, describe, expect, test } from "bun:test";
import { Game } from "./game-store";

const originalFetch = globalThis.fetch;

function stubWords(words: string[]): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(words), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function stubFailure(status: number): void {
  globalThis.fetch = (async () =>
    new Response("nope", { status })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeGame(playerMin = 3, playerMax = 10): Game {
  return new Game({ playerMin, playerMax });
}

function addPlayers(game: Game, names: string[]): void {
  for (const name of names) game.addPlayer(name);
}

describe("Game setup", () => {
  test("starts empty in the setup phase", () => {
    const snapshot = makeGame().getSnapshot();
    expect(snapshot.phase).toBe("setup");
    expect(snapshot.players).toEqual([]);
    expect(snapshot.canStart).toBe(false);
  });

  test("addPlayer validates and reports success", () => {
    const game = makeGame();
    expect(game.addPlayer("Alex")).toBe(true);
    expect(game.addPlayer("   ")).toBe(false);
    expect(game.addPlayer("alex")).toBe(false);
    expect(game.getSnapshot().error).toMatch(/already playing/);
    expect(game.getSnapshot().players.map((p) => p.name)).toEqual(["Alex"]);
  });

  test("enforces the player cap", () => {
    const game = makeGame(1, 2);
    expect(game.addPlayer("A")).toBe(true);
    expect(game.addPlayer("B")).toBe(true);
    expect(game.addPlayer("C")).toBe(false);
  });

  test("cannot start below the minimum", () => {
    const game = makeGame();
    addPlayers(game, ["A", "B"]);
    game.start();
    expect(game.getSnapshot().phase).toBe("setup");
    expect(game.getSnapshot().error).toMatch(/at least 3/);
  });
});

describe("a full round", () => {
  test("runs from category to results and updates the scoreboard", async () => {
    stubWords(["apple", "banana", "cherry"]);
    const game = makeGame();
    addPlayers(game, ["Alex", "Blair", "Cass"]);

    game.start();
    expect(game.getSnapshot().phase).toBe("category");

    await game.fetchWords("Fruit");
    expect(game.getSnapshot().phase).toBe("assignment");
    expect(game.getSnapshot().category).toBe("Fruit");

    game.beginPassing();
    const rolesSeen: string[] = [];
    for (let i = 0; i < 3; i++) {
      game.reveal();
      expect(game.getSnapshot().reveal).not.toBeNull();
      rolesSeen.push(game.getSnapshot().reveal!.roleName);
      game.advancePassing();
    }
    expect(rolesSeen).toHaveLength(3);
    expect(game.getSnapshot().phase).toBe("speaking");

    game.beginVoting();
    for (let i = 0; i < 3; i++) game.submitVotes([]);

    const results = game.getSnapshot();
    expect(results.phase).toBe("results");
    expect(results.results).toHaveLength(3);
    expect(results.scores).toHaveLength(3);
    expect(results.summary).not.toBeNull();

    game.nextRound();
    expect(game.getSnapshot().phase).toBe("category");
    expect(game.getSnapshot().round).toBe(2);
  });

  test("surfaces a word-service failure and recovers on retry", async () => {
    stubFailure(500);
    const game = makeGame();
    addPlayers(game, ["A", "B", "C"]);
    game.start();

    await game.fetchWords("Fruit");
    expect(game.getSnapshot().wordError).toBeTruthy();
    expect(game.getSnapshot().phase).toBe("category");

    stubWords(["x", "y"]);
    await game.fetchWords("Fruit");
    expect(game.getSnapshot().wordError).toBeNull();
    expect(game.getSnapshot().phase).toBe("assignment");
  });

  test("resetGame keeps players but clears scores", () => {
    const game = makeGame();
    addPlayers(game, ["A", "B", "C"]);
    game.resetGame();

    const snapshot = game.getSnapshot();
    expect(snapshot.phase).toBe("setup");
    expect(snapshot.players.map((p) => p.name)).toEqual(["A", "B", "C"]);
    expect(snapshot.scores.every((row) => row.total === 0)).toBe(true);
  });
});
