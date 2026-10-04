/**
 * Browser side of the Turnstile integration.
 *
 * Keeps the signed session token in `sessionStorage` (cleared when the tab
 * closes) and loads/renders the Turnstile widget. The browser never calls
 * siteverify: it hands the widget token to `/api/session` and stores what comes
 * back.
 */
import { TURNSTILE_SESSION_HEADER } from "./turnstile-shared";

const STORAGE_KEY = "b3.turnstile.session";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface StoredSession {
  token: string;
  expiresAt: number;
}

export interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readTurnstileSession(): StoredSession | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function saveTurnstileSession(session: StoredSession): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearTurnstileSession(): void {
  storage()?.removeItem(STORAGE_KEY);
}

/** True while a stored session exists and has not expired locally. */
export function hasTurnstileSession(): boolean {
  const session = readTurnstileSession();
  return session !== null && session.expiresAt > Date.now();
}

/** The `x-turnstile-session` header for an AI request, or `{}` without one. */
export function turnstileHeaders(): Record<string, string> {
  const session = readTurnstileSession();
  if (!session || session.expiresAt <= Date.now()) return {};
  return { [TURNSTILE_SESSION_HEADER]: session.token };
}

/** Exchange a widget token for the signed session token and store it. */
export async function requestTurnstileSession(
  turnstileToken: string,
): Promise<StoredSession> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: turnstileToken }),
  });

  if (!response.ok) {
    throw new Error("The human check could not be verified. Please try again.");
  }

  const data = (await response.json()) as {
    token?: unknown;
    expiresAt?: unknown;
  };
  if (typeof data.token !== "string" || typeof data.expiresAt !== "number") {
    throw new Error("The human check could not be verified. Please try again.");
  }

  const session = { token: data.token, expiresAt: data.expiresAt };
  saveTurnstileSession(session);
  return session;
}

let loader: Promise<TurnstileApi> | null = null;

/** Load the Turnstile script once and resolve with its API. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile can only load in the browser."));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const fail = () => reject(new Error("The human check failed to load."));
    const succeed = () => {
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-turnstile-api]",
    );
    if (existing) {
      existing.addEventListener("load", succeed, { once: true });
      existing.addEventListener("error", fail, { once: true });
      // It may already have finished loading before this module ran.
      if (window.turnstile) succeed();
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileApi = "true";
    script.addEventListener("load", succeed, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });

  return loader;
}
