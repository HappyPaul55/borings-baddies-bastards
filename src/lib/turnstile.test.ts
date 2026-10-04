import { afterEach, describe, expect, test } from "bun:test";
import {
  createTurnstileSession,
  handleSessionRequest,
  requireTurnstileSession,
  resolveTurnstileEnv,
  verifyTurnstileSession,
} from "./turnstile";
import { TURNSTILE_SESSION_HEADER } from "./turnstile-shared";

const originalFetch = globalThis.fetch;
const secret = "test-secret";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const env = { TURNSTILE_SECRET: secret, TURNSTILE_HOSTNAMES: "b3.test" };

function stubSiteverify(result: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(result), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("resolveTurnstileEnv", () => {
  test("is null without a secret and hostname", () => {
    expect(resolveTurnstileEnv({})).toBeNull();
    expect(resolveTurnstileEnv({ TURNSTILE_SECRET: "s" })).toBeNull();
    expect(resolveTurnstileEnv({ TURNSTILE_HOSTNAMES: "b3.test" })).toBeNull();
  });

  test("parses the secret and hostname list", () => {
    const resolved = resolveTurnstileEnv(env);
    expect(resolved?.secret).toBe(secret);
    expect([...(resolved?.hostnames ?? [])]).toEqual(["b3.test"]);
  });
});

describe("session token", () => {
  test("round-trips a freshly issued token", async () => {
    const session = await createTurnstileSession(secret, 0);
    expect(session.expiresAt).toBe(30 * 60 * 1000);
    expect(await verifyTurnstileSession(secret, session.token, 1000)).toBe(true);
  });

  test("rejects an expired token", async () => {
    const session = await createTurnstileSession(secret, 0);
    expect(await verifyTurnstileSession(secret, session.token, session.expiresAt + 1)).toBe(
      false,
    );
  });

  test("rejects a tampered token or the wrong secret", async () => {
    const session = await createTurnstileSession(secret, 0);
    const tampered = `${session.token.slice(0, -1)}x`;
    expect(await verifyTurnstileSession(secret, tampered)).toBe(false);
    expect(await verifyTurnstileSession("other-secret", session.token)).toBe(false);
    expect(await verifyTurnstileSession(secret, null)).toBe(false);
    expect(await verifyTurnstileSession(secret, "not-a-token")).toBe(false);
  });
});

describe("requireTurnstileSession", () => {
  const request = (token?: string) =>
    new Request("https://b3.test/api/words", {
      headers: token ? { [TURNSTILE_SESSION_HEADER]: token } : {},
    });

  test("fails closed when Turnstile is not configured", async () => {
    expect((await requireTurnstileSession(request(), null))?.status).toBe(503);
  });

  test("asks for verification without a valid session", async () => {
    const denial = await requireTurnstileSession(request(), resolveTurnstileEnv(env));
    expect(denial?.status).toBe(401);
    expect((await denial!.json()).code).toBe("turnstile_required");
  });

  test("allows a valid session through", async () => {
    const session = await createTurnstileSession(secret);
    const denial = await requireTurnstileSession(
      request(session.token),
      resolveTurnstileEnv(env),
    );
    expect(denial).toBeNull();
  });
});

describe("handleSessionRequest", () => {
  const post = (body: unknown) =>
    new Request("https://b3.test/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("exchanges a verified token for a session", async () => {
    stubSiteverify({ success: true, action: "open", hostname: "b3.test" });
    const response = await handleSessionRequest(
      post({ token: "good-token" }),
      resolveTurnstileEnv(env),
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as { token?: string; expiresAt?: number };
    expect(await verifyTurnstileSession(secret, data.token ?? null)).toBe(true);
    expect(data.expiresAt).toBeGreaterThan(Date.now());
  });

  test("rejects a failed verification", async () => {
    stubSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
    const response = await handleSessionRequest(
      post({ token: "bad-token" }),
      resolveTurnstileEnv(env),
    );
    expect(response.status).toBe(403);
  });

  test("rejects a mismatched action or hostname", async () => {
    stubSiteverify({ success: true, action: "other", hostname: "b3.test" });
    expect(
      (await handleSessionRequest(post({ token: "t" }), resolveTurnstileEnv(env)))
        .status,
    ).toBe(403);

    stubSiteverify({ success: true, action: "open", hostname: "evil.test" });
    expect(
      (await handleSessionRequest(post({ token: "t" }), resolveTurnstileEnv(env)))
        .status,
    ).toBe(403);
  });

  test("reports a GET without a session and a bad method", async () => {
    expect(
      (await handleSessionRequest(new Request("https://b3.test/api/session"), resolveTurnstileEnv(env)))
        .status,
    ).toBe(401);
    expect(
      (
        await handleSessionRequest(
          new Request("https://b3.test/api/session", { method: "DELETE" }),
          resolveTurnstileEnv(env),
        )
      ).status,
    ).toBe(405);
  });
});
