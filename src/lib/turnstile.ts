/**
 * Turnstile verification and the session token that lets one completed
 * challenge cover repeated AI calls for a window (default 30 minutes).
 *
 * Turnstile tokens are single-use and expire quickly, so the token itself
 * cannot be reused. `/api/session` verifies a token once and issues a signed,
 * stateless session token instead (HMAC-SHA256 over its expiry). The browser
 * keeps that in sessionStorage and sends it as `x-turnstile-session` on each AI
 * request. Shared by the production Worker and the Astro dev server so both
 * behave identically.
 */
import {
  TURNSTILE_ACTION,
  TURNSTILE_SESSION_HEADER,
  TURNSTILE_SESSION_TTL_SECONDS,
} from "./turnstile-shared";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export interface TurnstileEnv {
  secret: string;
  hostnames: Set<string>;
}

interface SiteverifyResult {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Read the Turnstile settings out of a Worker `env` / process env bag. */
export function resolveTurnstileEnv(
  env: Record<string, unknown>,
): TurnstileEnv | null {
  const secret =
    typeof env.TURNSTILE_SECRET === "string" ? env.TURNSTILE_SECRET.trim() : "";
  const hostnames = new Set(
    (typeof env.TURNSTILE_HOSTNAMES === "string" ? env.TURNSTILE_HOSTNAMES : "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );

  // Fail closed: without both pieces there is no way to verify a challenge.
  if (!secret || hostnames.size === 0) return null;
  return { secret, hostnames };
}

/** The response protected routes use when the challenge is missing or stale. */
export function turnstileRequiredResponse(): Response {
  return json(
    {
      error: "Please complete the human check to continue.",
      code: "turnstile_required",
    },
    401,
  );
}

/** Verify a raw Turnstile token once against siteverify. Fails closed. */
export async function verifyTurnstileToken(
  env: TurnstileEnv,
  token: unknown,
  remoteip?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return false;
  }

  const body = new URLSearchParams({ secret: env.secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as SiteverifyResult;
    return (
      result.success === true &&
      result.action === TURNSTILE_ACTION &&
      env.hostnames.has(result.hostname ?? "")
    );
  } catch {
    return false;
  }
}

const encoder = new TextEncoder();

async function sessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`turnstile-session-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;
    const binary = atob(base64 + (padding ? "=".repeat(4 - padding) : ""));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Issue a signed session token that expires after the configured window. */
export async function createTurnstileSession(
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowMs + TURNSTILE_SESSION_TTL_SECONDS * 1000;
  const payload = String(expiresAt);
  const key = await sessionKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  const token = `v1.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  return { token, expiresAt };
}

/** Verify a signed session token: correct signature, and not expired. */
export async function verifyTurnstileSession(
  secret: string,
  token: string | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;

  const payload = parts[1] ?? "";
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;

  const signature = base64UrlDecode(parts[2] ?? "");
  if (!signature) return false;

  try {
    const key = await sessionKey(secret);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

/**
 * Guard for an AI route: `null` when the request carries a valid session,
 * otherwise the response to send instead. Fails closed when unconfigured.
 */
export async function requireTurnstileSession(
  request: Request,
  env: TurnstileEnv | null,
): Promise<Response | null> {
  if (!env) {
    return json(
      {
        error: "The human check is not configured.",
        code: "turnstile_unconfigured",
      },
      503,
    );
  }

  const ok = await verifyTurnstileSession(
    env.secret,
    request.headers.get(TURNSTILE_SESSION_HEADER),
  );
  return ok ? null : turnstileRequiredResponse();
}

/**
 * `/api/session` handler. `GET` reports whether the caller's session is still
 * valid; `POST` exchanges a Turnstile token for a signed session. The browser
 * stores the returned token in sessionStorage.
 */
export async function handleSessionRequest(
  request: Request,
  env: TurnstileEnv | null,
): Promise<Response> {
  if (!env) {
    return json(
      {
        error: "The human check is not configured.",
        code: "turnstile_unconfigured",
      },
      503,
    );
  }

  if (request.method === "GET") {
    const ok = await verifyTurnstileSession(
      env.secret,
      request.headers.get(TURNSTILE_SESSION_HEADER),
    );
    return ok ? json({ ok: true }, 200) : turnstileRequiredResponse();
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "A JSON body is required." }, 400);
  }

  const token = (body as { token?: unknown } | null)?.token;
  const remoteip = request.headers.get("cf-connecting-ip") ?? undefined;

  if (!(await verifyTurnstileToken(env, token, remoteip))) {
    return json(
      {
        error: "The human check failed. Please try again.",
        code: "turnstile_failed",
      },
      403,
    );
  }

  return json(await createTurnstileSession(env.secret), 200);
}
