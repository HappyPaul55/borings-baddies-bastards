import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";
import { PhaseHeading } from "./PhaseHeading";
import { RoleReminders } from "./RoleReminders";

export function AssignmentPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();

  return (
    <section
      className="game-phase"
      data-phase="assignment"
      aria-labelledby="assignment-heading"
    >
      <div className="panel">
        <PhaseHeading id="assignment-heading">Roles assigned</PhaseHeading>
        <p className="mt-1 font-mono text-[0.72rem] font-bold tracking-[0.1em] text-muted uppercase">
          category: <span className="text-ink">{snapshot.category}</span>
        </p>

        <RoleReminders variant="tagline" />

        <p className="mt-4 text-[0.95rem] text-ink-soft">
          Pass the phone around, starting with{" "}
          <strong className="text-ink">{snapshot.firstPlayerName}</strong>. Each
          player checks their role privately, then passes it on.
        </p>
        <Button
          type="button"
          variant="primary"
          className="mt-5 w-full"
          onClick={() => client.beginPassing()}
        >
          Start passing
        </Button>
      </div>
    </section>
  );
}
