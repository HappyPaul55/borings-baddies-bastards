/**
 * Turnstile values shared by the server verification/session code and the
 * browser client. Kept dependency-free so both the Worker bundle and the React
 * island can import it without pulling in server-only code.
 */

/** The action the widget sends, and the value siteverify must echo back. */
export const TURNSTILE_ACTION = "open";

/** Request header carrying the signed session token from the browser. */
export const TURNSTILE_SESSION_HEADER = "x-turnstile-session";

/**
 * How long one completed challenge authorises AI calls, in seconds. Turnstile
 * tokens are single-use, so this window is carried by our own signed session
 * token rather than by the Turnstile token.
 */
export const TURNSTILE_SESSION_TTL_SECONDS = 30 * 60;
