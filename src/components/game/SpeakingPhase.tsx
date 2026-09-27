import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";
import { PhaseHeading } from "./PhaseHeading";
import { RoleReminders } from "./RoleReminders";

export function SpeakingPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();

  return (
    <section
      className="game-phase"
      data-phase="speaking"
      aria-labelledby="speaking-heading"
    >
      <div className="panel">
        <PhaseHeading id="speaking-heading">Discuss</PhaseHeading>
        <p className="mt-1 font-mono text-[0.72rem] font-bold tracking-[0.1em] text-muted uppercase">
          category: <span className="text-ink">{snapshot.category}</span>
        </p>
        <p className="mt-4 text-[0.95rem] text-ink-soft">
          Talk your way through the category. Boring players hunt for fakes,
          Baddies bluff, and Bastards play up the guilt.
        </p>

        <RoleReminders variant="goal" />

        <Button
          type="button"
          variant="primary"
          className="mt-5 w-full"
          onClick={() => client.beginVoting()}
        >
          Start voting
        </Button>
      </div>
    </section>
  );
}
