import { useEffect, useRef, useState } from "react";
import {
  loadTurnstile,
  requestTurnstileSession,
} from "../../lib/turnstile-client";
import { TURNSTILE_ACTION } from "../../lib/turnstile-shared";
import { PhaseHeading } from "./PhaseHeading";

interface Props {
  sitekey: string;
  onVerified: () => void;
}

/**
 * The human-check gate shown before the game and whenever a session expires.
 *
 * Renders the Turnstile widget explicitly, exchanges the token for a signed
 * 30-minute session and then hands control back to the caller. A token is
 * single-use, so the widget is reset after a failed exchange to allow a retry.
 */
export function TurnstileGate({ sitekey, onVerified }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifiedRef = useRef(onVerified);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Keep the latest callback without re-creating the widget on every render.
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey,
          action: TURNSTILE_ACTION,
          theme: "auto",
          callback: (token) => {
            if (!token) return;
            setChecking(true);
            setError(null);

            requestTurnstileSession(token)
              .then(() => {
                if (!cancelled) onVerifiedRef.current();
              })
              .catch((cause: unknown) => {
                if (cancelled) return;
                setChecking(false);
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "The human check could not be verified. Please try again.",
                );
                if (widgetIdRef.current) turnstile.reset(widgetIdRef.current);
              });
          },
          "error-callback": () => {
            if (!cancelled) {
              setError("The human check hit a problem. Please try again.");
            }
          },
          "expired-callback": () => {
            if (!cancelled) {
              setError("The human check expired. Please try again.");
            }
          },
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The human check failed to load.",
          );
        }
      });

    return () => {
      cancelled = true;
      const turnstile = window.turnstile;
      if (widgetIdRef.current && turnstile) {
        turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [sitekey]);

  return (
    <section
      className="game-phase"
      data-phase="verify"
      aria-labelledby="turnstile-heading"
    >
      <div className="panel">
        <p className="turn-line">Before we start</p>
        <PhaseHeading id="turnstile-heading">Confirm you are human</PhaseHeading>
        <p className="mt-2 text-[0.95rem] text-ink-soft">
          B3 uses AI to invent the secret words. To keep that free and fast, we
          ask for a quick check when you open the game — and only again after 30
          minutes. Your whole game stays on this device.
        </p>

        <div ref={containerRef} className="mt-5 flex justify-center" />

        {checking && (
          <p className="mt-4 flex items-center gap-2 text-[0.9rem] text-ink-soft">
            <span className="spinner" aria-hidden="true" /> Verifying…
          </p>
        )}

        {error && (
          <div className="alert alert--error mt-4" role="alert">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
