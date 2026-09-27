import { useEffect, useRef } from "react";
import { useGameClient, useGameSnapshot } from "./GameContext";
import { Button } from "./Button";
import { PhaseHeading } from "./PhaseHeading";

export function PassingPhase() {
  const client = useGameClient();
  const snapshot = useGameSnapshot();
  const passing = snapshot.passing;
  const revealRef = useRef<HTMLDivElement>(null);

  // The reveal button unmounts when the role appears, so move focus onto the
  // revealed content or keyboard / screen-reader users lose their place.
  useEffect(() => {
    if (snapshot.reveal) revealRef.current?.focus();
  }, [snapshot.reveal?.roleName]);

  if (!passing) return null;

  return (
    <section
      className="game-phase"
      data-phase="passing"
      aria-labelledby="passing-heading"
    >
      <div className="panel text-center">
        <PhaseHeading
          id="passing-heading"
          className="sr-only"
          focusKey={passing.position}
        >
          Pass the phone
        </PhaseHeading>
        <p className="turn-line">
          {`${passing.name}, it’s your turn (${passing.position} of ${passing.total})`}
        </p>

        {snapshot.reveal ? (
          <div>
            <div className="role-reveal" ref={revealRef} tabIndex={-1}>
              <p
                className={`role-reveal__name role-${snapshot.reveal.accent}`}
              >
                {snapshot.reveal.roleName}
              </p>
              {snapshot.reveal.word && (
                <p className="word-display">{snapshot.reveal.word}</p>
              )}
              <p className="mt-2 text-[0.98rem] text-ink-soft">
                {snapshot.reveal.description}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              className="mt-5 w-full"
              onClick={() => client.advancePassing()}
            >
              Got it — pass the phone
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-[0.95rem] text-ink-soft">
              Make sure nobody else can see the screen.
            </p>
            <Button
              type="button"
              variant="primary"
              className="mt-5 w-full"
              onClick={() => client.reveal()}
            >
              Tap to see your role
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
