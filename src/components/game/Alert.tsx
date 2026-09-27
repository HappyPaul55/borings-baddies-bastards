import type { GameClient } from "../../lib/game-store";

interface Props {
  message: string | null;
  client: GameClient;
}

/** Top-of-panel error message. Announced assertively, dismissed on next action. */
export function Alert({ message, client }: Props) {
  if (!message) return null;

  return (
    <div className="alert alert--error mb-4" role="alert">
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Dismiss message"
          onClick={() => client.dismissError()}
        >
          ×
        </button>
      </div>
    </div>
  );
}
