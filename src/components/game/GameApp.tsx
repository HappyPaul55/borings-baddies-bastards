import { useEffect, useState } from "react";
import { Game, PHASE_LABELS, type Phase } from "../../lib/game-store";
import { hasTurnstileSession } from "../../lib/turnstile-client";
import { GameClientContext, useGameSnapshot } from "./GameContext";
import { PhaseBadge } from "./PhaseBadge";
import { FullscreenButton } from "./FullscreenButton";
import { Alert } from "./Alert";
import { TurnstileGate } from "./TurnstileGate";
import { SetupPhase } from "./SetupPhase";
import { CategoryPhase } from "./CategoryPhase";
import { AssignmentPhase } from "./AssignmentPhase";
import { PassingPhase } from "./PassingPhase";
import { SpeakingPhase } from "./SpeakingPhase";
import { VotingPhase } from "./VotingPhase";
import { ResultsPhase } from "./ResultsPhase";

interface Props {
  playerMin: number;
  playerMax: number;
  /** Public Turnstile site key, rendered into the gate. */
  turnstileSiteKey: string;
}

/**
 * React island root for /play.
 *
 * It builds one `Game` and provides it to the tree. Everything below is a dumb
 * view over `GameSnapshot`; swapping `Game` for a WebSocket-backed room client
 * later should not require changes here.
 */
export default function GameApp({
  playerMin,
  playerMax,
  turnstileSiteKey,
}: Props) {
  const [client] = useState(() => new Game({ playerMin, playerMax }));

  return (
    <GameClientContext.Provider value={client}>
      <VerificationGate client={client} sitekey={turnstileSiteKey} />
    </GameClientContext.Provider>
  );
}

/**
 * Holds the game behind the Turnstile gate. A valid sessionStorage session is
 * read on mount; the AI call path sets `verificationRequired` when the 30-minute
 * window lapses, which brings the gate back.
 */
function VerificationGate({
  client,
  sitekey,
}: {
  client: Game;
  sitekey: string;
}) {
  const snapshot = useGameSnapshot();
  // `null` until sessionStorage has been read on the client, so the server
  // render and the first client render agree.
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    setVerified(hasTurnstileSession());
  }, []);

  useEffect(() => {
    if (snapshot.verificationRequired) setVerified(false);
  }, [snapshot.verificationRequired]);

  if (verified === null) {
    return (
      <div className="game-shell">
        <p className="mt-4 flex items-center gap-2 text-[0.9rem] text-ink-soft">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      </div>
    );
  }

  if (!verified) {
    return (
      <TurnstileGate
        sitekey={sitekey}
        onVerified={() => {
          client.dismissVerification();
          setVerified(true);
        }}
      />
    );
  }

  return <GameShell client={client} />;
}

function GameShell({ client }: { client: Game }) {
  const snapshot = useGameSnapshot();

  return (
    <div id="game" className="game-shell">
      <FullscreenButton />
      <PhaseBadge phase={snapshot.phase} />
      <p
        id="phase-status"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {`Phase: ${PHASE_LABELS[snapshot.phase]}`}
      </p>
      <Alert message={snapshot.error} client={client} />
      <PhaseRouter phase={snapshot.phase} />
    </div>
  );
}

function PhaseRouter({ phase }: { phase: Phase }) {
  switch (phase) {
    case "setup":
      return <SetupPhase />;
    case "category":
      return <CategoryPhase />;
    case "assignment":
      return <AssignmentPhase />;
    case "passing":
      return <PassingPhase />;
    case "speaking":
      return <SpeakingPhase />;
    case "voting":
      return <VotingPhase />;
    case "results":
      return <ResultsPhase />;
    default:
      return null;
  }
}
