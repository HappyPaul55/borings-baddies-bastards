import { useEffect, useState } from "react";
import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";
import { PhaseHeading } from "./PhaseHeading";

export function VotingPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();
  const voting = snapshot.voting;
  const [selected, setSelected] = useState<string[]>([]);

  // Clear the selection whenever it is a new voter's turn.
  useEffect(() => {
    setSelected([]);
  }, [voting?.voter]);

  if (!voting) return null;

  function toggle(name: string) {
    setSelected((previous) =>
      previous.includes(name)
        ? previous.filter((entry) => entry !== name)
        : [...previous, name],
    );
  }

  return (
    <section
      className="game-phase"
      data-phase="voting"
      aria-labelledby="voting-heading"
    >
      <div className="panel">
        <p className="turn-line">
          {`${voting.voter}, cast your votes (${voting.position} of ${voting.total})`}
        </p>
        <PhaseHeading id="voting-heading" focusKey={voting.voter}>
          Vote for the Baddies
        </PhaseHeading>
        <p className="mt-2 text-[0.95rem] text-ink-soft">
          Select everyone you suspect. You can pick as many as you like — the
          scoring rewards good calls and punishes bad ones.
        </p>

        <fieldset className="mt-5">
          <legend className="field-label">Suspects</legend>
          <div className="vote-list">
            {voting.options.map((name) => (
              <label key={name} className="vote-row">
                <input
                  type="checkbox"
                  name="vote"
                  value={name}
                  checked={selected.includes(name)}
                  onChange={() => toggle(name)}
                />
                <span className="vote-row__name">{name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button
          type="button"
          variant="primary"
          className="mt-5 w-full"
          onClick={() => client.submitVotes(selected)}
        >
          Submit votes
        </Button>
      </div>
    </section>
  );
}
