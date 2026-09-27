import { afterEach, describe, expect, test } from "bun:test";
import {
  WordSourceError,
  generateWords,
  parseWords,
  type WordSourceEnv,
} from "./word-source";
import { handleWordsRequest, resolveWordEnv } from "./words-api";

const originalFetch = globalThis.fetch;
const env: WordSourceEnv = { endpoint: "https://ai.test/chat", apiKey: "k" };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubChat(content: string, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("parseWords", () => {
  test("drops the first word and returns at most five", () => {
    expect(parseWords("cat, dog, fox, owl, bat, elk, ant")).toEqual([
      "dog",
      "fox",
      "owl",
      "bat",
      "elk",
    ]);
  });

  test("strips numbering, bullets and quotes, and lower-cases", () => {
    expect(parseWords("1. Cat\n2. Dog\n- Fox\n* Owl")).toEqual([
      "dog",
      "fox",
      "owl",
    ]);
    expect(parseWords('"Cat", "“Dog”", Fox')).toEqual(["dog", "fox"]);
  });

  test("de-duplicates case-insensitively and ignores code fences", () => {
    expect(parseWords("```\nCat, cat, DOG, dog, Fox\n```")).toEqual([
      "dog",
      "fox",
    ]);
  });

  test("returns nothing from empty or single-word replies", () => {
    expect(parseWords("")).toEqual([]);
    expect(parseWords("cat")).toEqual([]);
  });
});

describe("generateWords", () => {
  test("returns the parsed words from an OpenAI-shaped response", async () => {
    stubChat("cat, dog, fox, owl, bat");
    expect(await generateWords("Animals", env)).toEqual([
      "dog",
      "fox",
      "owl",
      "bat",
    ]);
  });

  test("caps the reply at 500 tokens and sends a model", async () => {
    let body: { model?: string; max_tokens?: number } = {};
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ message: { content: "cat, dog, fox, owl, bat" } }],
      });
    }) as unknown as typeof fetch;

    await generateWords("Animals", env);
    expect(body.max_tokens).toBe(500);
    expect(body.model).toBe("gpt-4o-mini");
  });

  test("enforces the 60-character category limit", async () => {
    stubChat("cat, dog, fox, owl, bat");
    await expect(generateWords("x".repeat(61), env)).rejects.toMatchObject({
      status: 400,
    });
    const words = await generateWords("x".repeat(60), env);
    expect(words.length).toBeGreaterThan(0);
  });

  test("rejects an empty category and a missing configuration", async () => {
    await expect(generateWords("  ", env)).rejects.toThrow(WordSourceError);
    await expect(
      generateWords("Animals", { endpoint: "", apiKey: "" }),
    ).rejects.toThrow(/not configured/);
  });

  test("throws a 502 when the provider errors or replies with junk", async () => {
    stubChat("ignored", 500);
    await expect(generateWords("Animals", env)).rejects.toMatchObject({
      status: 502,
    });

    globalThis.fetch = (async () =>
      new Response("not json", { status: 200 })) as typeof fetch;
    await expect(generateWords("Animals", env)).rejects.toMatchObject({
      status: 502,
    });
  });

  test("throws a 422 when no usable words come back", async () => {
    stubChat("cat");
    await expect(generateWords("Animals", env)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("resolveWordEnv", () => {
  test("is null without an endpoint and key", () => {
    expect(resolveWordEnv({})).toBeNull();
    expect(resolveWordEnv({ AI_ENDPOINT: "https://ai.test" })).toBeNull();
  });

  test("reads the three settings", () => {
    expect(
      resolveWordEnv({
        AI_ENDPOINT: "https://ai.test",
        AI_API_KEY: "secret",
        AI_MODEL: "small",
      }),
    ).toEqual({ endpoint: "https://ai.test", apiKey: "secret", model: "small" });
  });
});

describe("handleWordsRequest", () => {
  const url = (query: string) => new Request(`https://b3.test/api/words${query}`);

  test("rejects non-GET, missing terms and unconfigured envs", async () => {
    expect(
      (await handleWordsRequest(new Request(url("?term=x"), { method: "POST" }), env))
        .status,
    ).toBe(405);
    expect((await handleWordsRequest(url(""), env)).status).toBe(400);
    expect((await handleWordsRequest(url("?term=Cats"), null)).status).toBe(503);
  });

  test("rejects an over-long category", async () => {
    const response = await handleWordsRequest(
      url(`?term=${"x".repeat(61)}`),
      env,
    );
    expect(response.status).toBe(400);
  });

  test("returns the words as a JSON array", async () => {
    stubChat("cat, dog, fox, owl, bat");
    const response = await handleWordsRequest(url("?term=Animals"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(["dog", "fox", "owl", "bat"]);
  });

  test("maps a provider failure to a 502", async () => {
    stubChat("ignored", 500);
    const response = await handleWordsRequest(url("?term=Animals"), env);
    expect(response.status).toBe(502);
  });
});
