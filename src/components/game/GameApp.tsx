import { useState } from "react";
import { Game, PHASE_LABELS, type Phase } from "../../lib/game-store";
import { GameClientContext, useGameSnapshot } from "./GameContext";
import { PhaseBadge } from "./PhaseBadge";
import { Alert } from "./Alert";
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
}

/**
 * React island root for /play.
 *
 * It builds one `Game` and provides it to the tree. Everything below is a dumb
 * view over `GameSnapshot`; swapping `Game` for a WebSocket-backed room client
 * later should not require changes here.
 */
export default function GameApp({ playerMin, playerMax }: Props) {
  const [client] = useState(() => new Game({ playerMin, playerMax }));

  return (
    <GameClientContext.Provider value={client}>
      <GameShell client={client} />
    </GameClientContext.Provider>
  );
}

function GameShell({ client }: { client: Game }) {
  const snapshot = useGameSnapshot();

  return (
    <div id="game" className="game-shell">
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
