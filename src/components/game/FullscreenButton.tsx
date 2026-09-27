import { useEffect, useState } from "react";
import { Button } from "./Button";

/**
 * Fullscreen toggle for the game, shown only on small screens (the phone the
 * group passes around). Hidden entirely when the browser cannot fullscreen an
 * element — most notably iOS Safari, which only supports fullscreen on media.
 *
 * It fullscreens the `#game` shell rather than the document, so the site header
 * and footer stay out of the way. Rendered above the phase badge so it is the
 * first control in the shell (and stays reachable to exit fullscreen).
 */
export function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fullscreenEnabled) return;

    setSupported(true);
    setActive(document.fullscreenElement !== null);

    const onChange = () => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!supported) return null;

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const target =
          document.getElementById("game") ?? document.documentElement;
        await target.requestFullscreen();
      }
    } catch {
      // The browser can reject a request (e.g. without a user gesture); the
      // fullscreenchange listener keeps the label in step either way.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="mb-3 w-full md:hidden"
      aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
      onClick={() => void toggle()}
    >
      {active ? "Exit fullscreen" : "Fullscreen"}
    </Button>
  );
}
